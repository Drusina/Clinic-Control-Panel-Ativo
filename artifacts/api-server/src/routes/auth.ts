import { Router, type IRouter } from "express";
import type { Request } from "express";
import { signToken, verifyToken, extractToken } from "../middleware/auth";
import { db } from "@workspace/db";
import { teamTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const loginAttempts = new Map<string, { count: number; windowStart: number }>();

function getClientIp(req: Request): string {
  return req.socket?.remoteAddress ?? "unknown";
}

router.post("/auth/login", (req, res): void => {
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
  const { memberId, inviteToken } = req.body as { memberId?: string; inviteToken?: string };

  if (!memberId || !inviteToken) {
    res.status(400).json({ error: "memberId e inviteToken são obrigatórios" });
    return;
  }

  const tokenPayload = verifyToken(inviteToken);
  if (
    !tokenPayload ||
    tokenPayload.purpose !== "team_invite" ||
    tokenPayload.memberId !== memberId
  ) {
    res.status(401).json({ error: "Token de convite inválido ou expirado" });
    return;
  }

  const [member] = await db
    .select()
    .from(teamTable)
    .where(eq(teamTable.id, memberId))
    .limit(1);

  if (!member) {
    res.status(404).json({ error: "Membro não encontrado" });
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

  const sessionToken = signToken({
    role: "team_member",
    sub: member.email,
    email: member.email,
    clinicId: member.clinicId,
    teamMemberId: member.id,
    nome: member.nome,
  });

  await db
    .update(teamTable)
    .set({ lastAccessAt: new Date() })
    .where(eq(teamTable.id, member.id));

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
