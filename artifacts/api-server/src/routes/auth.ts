import { Router, type IRouter } from "express";
import type { Request } from "express";
import { signToken, verifyToken, extractToken } from "../middleware/auth";

const router: IRouter = Router();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const loginAttempts = new Map<string, { count: number; windowStart: number }>();

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
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

  const token = signToken({ role: "super_admin" });
  res.json({ token, role: "super_admin" });
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
  res.json({ role: payload.role ?? null });
});

export default router;
