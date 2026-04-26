import { Router, type IRouter } from "express";
import type { Request } from "express";
import { createHash } from "crypto";
import { signToken, verifyToken, extractToken } from "../middleware/auth";
import { db } from "@workspace/db";
import { teamTable } from "@workspace/db/schema";
import { and, eq, isNull } from "drizzle-orm";

const router: IRouter = Router();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const loginAttempts = new Map<string, { count: number; windowStart: number }>();

function getClientIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

router.post("/auth/login", (req, res): void => {
  res.setHeader("Cache-Control", "no-store");
  const superAdminSecret = process.env.SUPER_ADMIN_SECRET;

  if (!superAdminSecret) {
    res.status(503).json({ error: "Super Admin não configurado no servidor. Defina a variável SUPER_ADMIN_SECRET." });
    return;
  }

  const ip = getClientIp(req);
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (entry && now - entry.windowStart < WINDOW_MS) {
    if (entry.count >= MAX_ATTEMPTS) {
      const retryAfter = Math.ceil((WINDOW_MS - (now - entry.windowStart)) / 1000);
      res.setHeader("Retry-After", retryAfter);
      res.status(429).json({ error: "Muitas tentativas. Tente novamente em alguns minutos." });
      return;
    }
    entry.count++;
  } else {
    loginAttempts.set(ip, { count: 1, windowStart: now });
  }

  const { secret } = req.body as { secret?: string };

  if (!secret || secret !== superAdminSecret) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  loginAttempts.delete(ip);

  const token = signToken({ role: "super_admin", sub: "super_admin" });
  res.json({ token, role: "super_admin" });
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

  const sessionToken = signToken({
    role: "team_member",
    sub: member.email,
    email: member.email,
    clinicId: member.clinicId,
    teamMemberId: member.id,
    nome: member.nome,
  });

  res.json({
    token: sessionToken,
    role: "team_member",
    nome: member.nome,
    funcao: member.funcao,
    email: member.email,
    clinicId: member.clinicId,
    teamMemberId: member.id,
  });
});

router.get("/auth/me", (req, res): void => {
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
  res.json({
    role: payload.role ?? null,
    clinicId: payload.clinicId ?? null,
    nome: payload.nome ?? null,
    email: payload.sub ?? null,
    teamMemberId: payload.teamMemberId ?? null,
  });
});

export default router;
