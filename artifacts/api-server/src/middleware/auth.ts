import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

function getSecret(): string | null {
  return process.env.SUPER_ADMIN_SECRET ?? null;
}

function base64urlEncode(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function base64urlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

const TOKEN_TTL_SECONDS = 8 * 60 * 60;

export function signToken(payload: Record<string, unknown>): string {
  const secret = getSecret();
  if (!secret) throw new Error("SUPER_ADMIN_SECRET is not configured");
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64urlEncode(
    JSON.stringify({ ...payload, iat: now, exp: now + TOKEN_TTL_SECONDS })
  );
  const sig = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): Record<string, unknown> | null {
  const secret = getSecret();
  if (!secret) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = createHmac("sha256", secret)
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
