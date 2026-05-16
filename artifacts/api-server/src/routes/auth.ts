import { Router, type IRouter } from "express";
import type { Request } from "express";
import { createHash } from "crypto";
import { and, eq, isNull, gt, sql } from "drizzle-orm";
import { signToken, verifyToken, extractToken, requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { db, teamTable, teamCredentialsTable } from "@workspace/db";
import {
  hashPassword,
  verifyPassword,
  upsertCredential,
  findCredentialByEmail,
  hasPlatformAccess,
  findDisplayName,
  normalizeEmail,
  generateResetToken,
  hashResetToken,
} from "../lib/credentials.js";
import { sendEmail, buildResetSenhaEmail, resolveAppUrl } from "../lib/email.js";

const router: IRouter = Router();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const loginAttempts = new Map<string, { count: number; windowStart: number }>();

function getClientIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

/**
 * IP-based throttle shared across the password endpoints. Returns true when
 * the request must be refused; caller still needs to `return` after sending
 * the 429 response.
 */
function throttle(req: Request, res: import("express").Response): boolean {
  const ip = getClientIp(req);
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (entry && now - entry.windowStart < WINDOW_MS) {
    if (entry.count >= MAX_ATTEMPTS) {
      const retryAfter = Math.ceil((WINDOW_MS - (now - entry.windowStart)) / 1000);
      res.setHeader("Retry-After", retryAfter);
      res.status(429).json({ error: "Muitas tentativas. Tente novamente em alguns minutos." });
      return true;
    }
    entry.count++;
  } else {
    loginAttempts.set(ip, { count: 1, windowStart: now });
  }
  return false;
}

function clearThrottle(req: Request): void {
  loginAttempts.delete(getClientIp(req));
}

router.post("/auth/login", (req, res): void => {
  res.setHeader("Cache-Control", "no-store");
  const superAdminSecret = process.env.SUPER_ADMIN_SECRET;

  if (!superAdminSecret) {
    res.status(503).json({ error: "Super Admin não configurado no servidor. Defina a variável SUPER_ADMIN_SECRET." });
    return;
  }

  if (throttle(req, res)) return;

  const { secret } = req.body as { secret?: string };

  if (!secret || secret !== superAdminSecret) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  clearThrottle(req);

  const token = signToken({ role: "super_admin", sub: "super_admin" });
  res.json({ token, role: "super_admin" });
});

/**
 * POST /auth/entrar — login por e-mail + senha (team_member).
 * Devolve JWT v:2 idêntico ao emitido pelo /convite. `senhaProvisoria` indica
 * se o frontend deve forçar a troca imediata.
 */
router.post("/auth/entrar", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  if (throttle(req, res)) return;

  const body = req.body as { email?: string; senha?: string };
  const email = body.email ? normalizeEmail(body.email) : "";
  const senha = body.senha ?? "";

  if (!email || !senha) {
    res.status(400).json({ error: "Informe e-mail e senha." });
    return;
  }

  const credential = await findCredentialByEmail(email);

  // Anti-enumeração: sempre rodamos bcrypt (com hash dummy quando a conta não
  // existe) para igualar o tempo de resposta entre "conta inexistente" e
  // "senha errada". DUMMY_HASH é um bcrypt válido de uma senha aleatória
  // inalcançável.
  const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.0c2g0VqkLZB3DZNvJrR3lJOpRpZW";
  const passwordOk = credential
    ? await verifyPassword(senha, credential.senhaHash)
    : (await verifyPassword(senha, DUMMY_HASH), false);

  if (!credential) {
    res.status(401).json({ error: "E-mail ou senha inválidos." });
    return;
  }

  // Lockout: se a janela expirou, reseta o contador antes de avaliar a senha.
  // Isso evita "lockout cumulativo" — após 15min livres, o usuário começa do zero.
  const now = new Date();
  let failedAttempts = credential.failedAttempts;
  if (credential.lockedUntil && credential.lockedUntil <= now) {
    failedAttempts = 0;
  } else if (credential.lockedUntil && credential.lockedUntil > now) {
    res.status(401).json({ error: "E-mail ou senha inválidos." });
    return;
  }

  if (!passwordOk) {
    const failed = failedAttempts + 1;
    const lockedUntil = failed >= 8 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await db
      .update(teamCredentialsTable)
      .set({ failedAttempts: failed, lockedUntil, updatedAt: new Date() })
      .where(eq(teamCredentialsTable.id, credential.id));
    res.status(401).json({ error: "E-mail ou senha inválidos." });
    return;
  }

  // Mesmo com senha correta, exige acesso a pelo menos uma clínica. Quando
  // o gestor revoga, derrubamos o login (com resposta idêntica para evitar
  // enumeração de contas com/sem acesso).
  const stillHasAccess = await hasPlatformAccess(email);
  if (!stillHasAccess) {
    res.status(401).json({ error: "E-mail ou senha inválidos." });
    return;
  }

  await db
    .update(teamCredentialsTable)
    .set({ failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(teamCredentialsTable.id, credential.id));

  // Atualiza lastAccessAt em todas as linhas equipe_interna desse e-mail.
  // Case-insensitive porque a coluna `email` em equipe_interna não tem
  // normalização garantida (caminhos antigos podem ter persistido com
  // case misto).
  await db.execute(
    sql`UPDATE equipe_interna SET last_access_at = NOW() WHERE LOWER(email) = ${email}`,
  );

  clearThrottle(req);

  const nome = (await findDisplayName(email)) ?? email;
  const token = signToken({
    role: "team_member",
    sub: email,
    email,
    nome,
    v: 2,
  });

  res.json({
    token,
    role: "team_member",
    email,
    nome,
    senhaProvisoria: credential.senhaProvisoria,
  });
});

/**
 * POST /auth/trocar-senha — autenticado, troca a senha atual pela nova.
 * Limpa o flag `senhaProvisoria` e qualquer token de reset pendente.
 */
router.post("/auth/trocar-senha", requireAuth, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const user = (req as AuthenticatedRequest).user;
  if (user.role !== "team_member") {
    res.status(403).json({ error: "Apenas membros de equipe usam senha." });
    return;
  }
  const email = (user.email ?? user.sub ?? "").trim();
  if (!email) {
    res.status(403).json({ error: "Sessão sem identificação de e-mail." });
    return;
  }

  const body = req.body as { senhaAtual?: string; novaSenha?: string };
  const senhaAtual = body.senhaAtual ?? "";
  const novaSenha = body.novaSenha ?? "";

  if (novaSenha.length < 8) {
    res.status(400).json({ error: "A nova senha deve ter pelo menos 8 caracteres." });
    return;
  }
  if (novaSenha === senhaAtual) {
    res.status(400).json({ error: "A nova senha precisa ser diferente da atual." });
    return;
  }

  const credential = await findCredentialByEmail(email);
  if (!credential) {
    res.status(404).json({ error: "Credencial não encontrada para este usuário." });
    return;
  }

  const ok = await verifyPassword(senhaAtual, credential.senhaHash);
  if (!ok) {
    res.status(401).json({ error: "Senha atual incorreta." });
    return;
  }

  const newHash = await hashPassword(novaSenha);
  await upsertCredential({ email, passwordHash: newHash, provisional: false });
  res.json({ ok: true, senhaProvisoria: false });
});

/**
 * POST /auth/esqueci-senha — sempre responde 204 (não vaza se conta existe).
 * Emite token de 1h apenas se houver credencial OU acesso ativo.
 */
router.post("/auth/esqueci-senha", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  if (throttle(req, res)) return;

  const body = req.body as { email?: string };
  const email = body.email ? normalizeEmail(body.email) : "";
  if (!email) {
    res.sendStatus(204);
    return;
  }

  const credential = await findCredentialByEmail(email);
  const hasAccess = credential ? true : await hasPlatformAccess(email);

  if (!hasAccess) {
    res.sendStatus(204);
    return;
  }

  const { token, hash, expiresAt } = generateResetToken();

  if (credential) {
    await db
      .update(teamCredentialsTable)
      .set({ resetTokenHash: hash, resetTokenExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(teamCredentialsTable.id, credential.id));
  } else {
    // Membro tem acesso mas nunca recebeu senha (ex.: migração) — cria linha
    // com senha aleatória inalcançável; o reset definirá a senha real.
    const placeholderHash = await hashPassword(generateResetToken().token);
    await db.insert(teamCredentialsTable).values({
      emailNormalized: email,
      senhaHash: placeholderHash,
      senhaProvisoria: true,
      resetTokenHash: hash,
      resetTokenExpiresAt: expiresAt,
    });
  }

  const appUrl = await resolveAppUrl(req);
  const resetLink = `${appUrl}/redefinir-senha?token=${encodeURIComponent(token)}`;
  const nome = (await findDisplayName(email)) ?? "";

  sendEmail({
    to: email,
    subject: "[IONEX360] Redefinir sua senha",
    html: buildResetSenhaEmail({ nome, resetLink }),
  }).catch(() => {});

  res.sendStatus(204);
});

/**
 * POST /auth/redefinir-senha — consome token, grava nova senha, marca não-provisória.
 */
router.post("/auth/redefinir-senha", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  if (throttle(req, res)) return;

  const body = req.body as { token?: string; novaSenha?: string };
  const token = body.token ?? "";
  const novaSenha = body.novaSenha ?? "";

  if (!token || novaSenha.length < 8) {
    res.status(400).json({ error: "Informe o token e uma nova senha (mínimo 8 caracteres)." });
    return;
  }

  const tokenHash = hashResetToken(token);
  const [credential] = await db
    .select()
    .from(teamCredentialsTable)
    .where(
      and(
        eq(teamCredentialsTable.resetTokenHash, tokenHash),
        gt(teamCredentialsTable.resetTokenExpiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!credential) {
    res.status(401).json({ error: "Link de redefinição inválido ou expirado. Solicite um novo." });
    return;
  }

  const newHash = await hashPassword(novaSenha);
  await db
    .update(teamCredentialsTable)
    .set({
      senhaHash: newHash,
      senhaProvisoria: false,
      senhaAlteradaEm: new Date(),
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(teamCredentialsTable.id, credential.id));

  res.json({ ok: true });
});

router.post("/auth/convite", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const { code } = req.body as { code?: string };

  if (!code) {
    res.status(400).json({ error: "code é obrigatório" });
    return;
  }

  const codeHash = createHash("sha256").update(code).digest("hex");

  const [member] = await db
    .select()
    .from(teamTable)
    .where(eq(teamTable.inviteCodeHash, codeHash))
    .limit(1);

  if (!member) {
    res.status(401).json({ error: "Token de convite inválido ou expirado" });
    return;
  }

  if (!member.inviteCodeExpiresAt || member.inviteCodeExpiresAt < new Date()) {
    res.status(401).json({ error: "Token de convite inválido ou expirado" });
    return;
  }

  if (!member.temAcessoPlataforma) {
    res.status(403).json({ error: "Acesso à plataforma não habilitado para este membro" });
    return;
  }

  if (!member.email) {
    res.status(403).json({ error: "Este membro não possui e-mail cadastrado e não pode acessar a plataforma" });
    return;
  }

  const now = new Date();
  const redeemed = await db
    .update(teamTable)
    .set({
      lastAccessAt: now,
      inviteRedeemedAt: now,
      inviteCodeHash: null,
      inviteCodeExpiresAt: null,
    })
    .where(and(eq(teamTable.id, member.id), isNull(teamTable.inviteRedeemedAt)))
    .returning({ id: teamTable.id });

  if (redeemed.length === 0) {
    res.status(401).json({ error: "Token de convite já utilizado. Solicite um novo convite." });
    return;
  }

  // Mantemos o convite legado funcional: emite JWT v:2. Se o usuário ainda
  // não tem credencial, marcamos `senhaProvisoria=true` em resposta para
  // o frontend forçar a criação de senha. Não geramos hash aqui — a senha
  // real é criada na tela /trocar-senha-inicial (sem `senhaAtual`).
  const credential = await findCredentialByEmail(member.email);
  const sessionToken = signToken({
    role: "team_member",
    sub: member.email,
    email: member.email,
    nome: member.nome,
    v: 2,
  });

  res.json({
    token: sessionToken,
    role: "team_member",
    nome: member.nome,
    funcao: member.funcao,
    email: member.email,
    clinicId: member.clinicId,
    teamMemberId: member.id,
    senhaProvisoria: !credential || credential.senhaProvisoria,
    precisaCriarSenha: !credential,
  });
});

/**
 * POST /auth/criar-senha-inicial — usado pelo fluxo legado de convite quando
 * o usuário não tem credencial ainda. Requer sessão válida (JWT do convite).
 * Cria a credencial definitiva sem exigir senhaAtual.
 */
router.post("/auth/criar-senha-inicial", requireAuth, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const user = (req as AuthenticatedRequest).user;
  if (user.role !== "team_member") {
    res.status(403).json({ error: "Apenas membros de equipe usam senha." });
    return;
  }
  const email = (user.email ?? user.sub ?? "").trim();
  if (!email) {
    res.status(403).json({ error: "Sessão sem identificação de e-mail." });
    return;
  }
  const body = req.body as { novaSenha?: string };
  const novaSenha = body.novaSenha ?? "";
  if (novaSenha.length < 8) {
    res.status(400).json({ error: "A nova senha deve ter pelo menos 8 caracteres." });
    return;
  }

  // Só permite se ainda não houver credencial OU se a credencial estiver
  // marcada como provisória (caso o usuário tenha entrado pelo convite mas
  // ainda não tenha trocado a senha).
  const existing = await findCredentialByEmail(email);
  if (existing && !existing.senhaProvisoria) {
    res.status(409).json({ error: "Já existe uma senha definida para este usuário. Use /auth/trocar-senha." });
    return;
  }

  const newHash = await hashPassword(novaSenha);
  await upsertCredential({ email, passwordHash: newHash, provisional: false });
  res.json({ ok: true, senhaProvisoria: false });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");
  const token = extractToken(req);
  if (!token) {
    res.json({ role: null });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.json({ role: null });
    return;
  }

  let senhaProvisoria: boolean | null = null;
  if (payload.role === "team_member") {
    const email = (payload.email as string | undefined) ?? (payload.sub as string | undefined);
    if (email) {
      const cred = await findCredentialByEmail(email);
      senhaProvisoria = cred ? cred.senhaProvisoria : true; // sem cred → precisa criar
    }
  }

  res.json({
    role: payload.role ?? null,
    clinicId: payload.clinicId ?? null,
    nome: payload.nome ?? null,
    email: (payload.email ?? payload.sub) ?? null,
    teamMemberId: payload.teamMemberId ?? null,
    v: payload.v ?? 1,
    senhaProvisoria,
  });
});

export default router;
