import { createHmac, timingSafeEqual, randomBytes, createHash } from "crypto";
import type { Request, Response, NextFunction } from "express";

function getSigningSecret(): string | null {
  return process.env.TOKEN_SIGNING_SECRET ?? null;
}

function base64urlEncode(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function base64urlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

const SESSION_TTL_SECONDS = 8 * 60 * 60;
const INVITE_CODE_TTL_SECONDS = 72 * 60 * 60;

export const INVITE_CODE_TTL_MS = INVITE_CODE_TTL_SECONDS * 1000;

export function generateInviteCode(): { code: string; hash: string; expiresAt: Date } {
  const code = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + INVITE_CODE_TTL_MS);
  return { code, hash, expiresAt };
}

export function signToken(payload: Record<string, unknown>, ttlSeconds = SESSION_TTL_SECONDS): string {
  const signingSecret = getSigningSecret();
  if (!signingSecret) throw new Error("TOKEN_SIGNING_SECRET is not configured");
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64urlEncode(
    JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds })
  );
  const sig = createHmac("sha256", signingSecret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): Record<string, unknown> | null {
  const signingSecret = getSigningSecret();
  if (!signingSecret) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = createHmac("sha256", signingSecret)
      .update(`${header}.${body}`)
      .digest("base64url");
    const expectedBuf = Buffer.from(expectedSig);
    const actualBuf = Buffer.from(sig);
    if (
      expectedBuf.length !== actualBuf.length ||
      !timingSafeEqual(expectedBuf, actualBuf)
    ) {
      return null;
    }
    const claims = JSON.parse(base64urlDecode(body)) as Record<string, unknown>;
    const exp = claims.exp as number | undefined;
    if (exp && Math.floor(Date.now() / 1000) > exp) return null;
    return claims;
  } catch {
    return null;
  }
}

export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

export function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized: missing token" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload || payload.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden: super_admin role required" });
    return;
  }
  next();
}

const SESSION_ROLES = new Set(["super_admin", "team_member"]);

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized: missing token" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized: invalid token" });
    return;
  }
  if (!SESSION_ROLES.has(payload.role as string)) {
    res.status(403).json({ error: "Forbidden: not a valid session token" });
    return;
  }
  (req as Request & { user: Record<string, unknown> }).user = payload;
  next();
}
