import { createHmac, timingSafeEqual, randomBytes, createHash } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, teamTable } from "@workspace/db";
import { getTokenSigningSecret } from "../lib/token-secret.js";

function getSigningSecret(): string | null {
  try {
    return getTokenSigningSecret();
  } catch {
    return null;
  }
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

export interface AuthUser {
  role: "super_admin" | "team_member";
  email?: string;
  sub?: string;
  nome?: string;
  teamMemberId?: string;
  clinicId?: string;
}

export type AuthenticatedRequest = Request & { user: AuthUser };

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
  (req as AuthenticatedRequest).user = payload as unknown as AuthUser;
  next();
}

/**
 * Resolve the clinicId targeted by the request. We accept the URL params used
 * across the codebase: `:clinicId` (most routers) and `:id` (clinicsRouter).
 *
 * IMPORTANT: When this middleware is registered via `router.use(mw, subRouter)`,
 * Express runs `mw` BEFORE the sub-router matches its `:id`/`:clinicId` param,
 * so `req.params` is empty at this point. As a fallback we parse the URL path
 * directly looking for the conventional `/clinics/<uuid>` segment used across
 * every clinic-scoped router in this codebase.
 */
const CLINIC_PATH_RE = /\/clinics\/([0-9a-fA-F-]{36})(?:\/|$|\?)/;

function extractClinicIdFromParams(req: Request): string | undefined {
  const cid = req.params.clinicId;
  if (typeof cid === "string" && cid.length > 0) return cid;
  const id = req.params.id;
  if (typeof id === "string" && id.length > 0) return id;
  const url = req.originalUrl || req.url || "";
  const m = CLINIC_PATH_RE.exec(url);
  if (m) return m[1];
  return undefined;
}

/**
 * Look up whether a person identified by `email` has platform access to a
 * given `clinicId` via the `equipe_interna` table. Email matching is
 * case-insensitive (normalized via `lower()`) because invites can be
 * issued by a super admin who types the email in any casing.
 *
 * Returns the matching row id (used to populate `req.user.teamMemberId`)
 * or null when no eligible row is found.
 */
async function findClinicAccess(
  email: string,
  clinicId: string,
): Promise<{ teamMemberId: string } | null> {
  const rows = await db
    .select({ id: teamTable.id, temAcesso: teamTable.temAcessoPlataforma })
    .from(teamTable)
    .where(
      and(
        eq(teamTable.clinicId, clinicId),
        sql`lower(${teamTable.email}) = lower(${email})`,
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!row.temAcesso) return null;
  return { teamMemberId: row.id };
}

/**
 * Authorise the request based on access to the clinic identified in the URL.
 *
 * - Super admin always passes (operator-level access).
 * - Team member passes only when their email is in `equipe_interna` for
 *   the requested clinic with `tem_acesso_plataforma = true`.
 * - Anything else → 403.
 *
 * Use this on every router whose paths are scoped by clinic
 * (`/clinics/:id/...` or `/clinics/:clinicId/...`). For globally-scoped
 * admin endpoints, keep `requireSuperAdmin`.
 */
export async function requireClinicAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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
  if (payload.role === "super_admin") {
    (req as AuthenticatedRequest).user = payload as unknown as AuthUser;
    next();
    return;
  }
  if (payload.role !== "team_member") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const clinicId = extractClinicIdFromParams(req);
  if (!clinicId) {
    // No clinic context in the URL → this isn't a clinic-scoped route. Because
    // `router.use(mw, subRouter)` actually installs `mw` as a global layer that
    // runs on EVERY subsequent request (not just paths matched by subRouter),
    // we must not block here — the request is on its way to a different
    // (super-admin or user-scoped) endpoint mounted later. We attach the
    // payload as a best-effort `req.user` and let downstream middleware
    // (requireSuperAdmin / requireAuth) make the real authorization call.
    (req as AuthenticatedRequest).user = payload as unknown as AuthUser;
    next();
    return;
  }

  const email = (payload.email as string | undefined) ?? (payload.sub as string | undefined);
  if (!email) {
    res.status(403).json({ error: "Forbidden: token sem identificação de email" });
    return;
  }

  try {
    const access = await findClinicAccess(email, clinicId);
    if (!access) {
      res.status(403).json({ error: "Forbidden: sem acesso a esta clínica" });
      return;
    }
    (req as AuthenticatedRequest).user = {
      ...(payload as unknown as AuthUser),
      email,
      teamMemberId: access.teamMemberId,
      clinicId,
    };
    next();
  } catch (err) {
    console.error("[requireClinicAccess] lookup failed", err);
    res.status(500).json({ error: "Erro ao verificar acesso" });
  }
}

/**
 * Inline access check for handlers that can't be gated by middleware
 * because the clinicId isn't a URL parameter (e.g. `/team/:id` where the
 * clinicId is fetched from the database first, or `/diagnostics/:id` that
 * resolves to a clinic).
 *
 * Pre-condition: the route is already mounted under `requireAuth`, so
 * `req.user` is populated.
 *
 * Returns `true` when the response was already sent (caller should `return`).
 * Returns `false` when access is granted.
 */
export async function assertClinicAccess(
  req: Request,
  res: Response,
  clinicId: string,
): Promise<boolean> {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return true;
  }
  if (user.role === "super_admin") return false;
  if (user.role !== "team_member") {
    res.status(403).json({ error: "Forbidden" });
    return true;
  }
  const email = user.email ?? user.sub;
  if (!email) {
    res.status(403).json({ error: "Forbidden: token sem email" });
    return true;
  }
  const access = await findClinicAccess(email, clinicId);
  if (!access) {
    res.status(403).json({ error: "Sem acesso a esta clínica" });
    return true;
  }
  return false;
}

/**
 * List the clinic ids a session can access. Super admin → null (means "all").
 * Team member → array of clinic ids resolved from `equipe_interna` by email.
 * Returns null + isSuperAdmin=false when the session is invalid.
 */
export async function listAccessibleClinicIds(
  req: Request,
): Promise<{ isSuperAdmin: boolean; clinicIds: string[] | null; email: string | null; nome: string | null }> {
  const token = extractToken(req);
  if (!token) return { isSuperAdmin: false, clinicIds: null, email: null, nome: null };
  const payload = verifyToken(token);
  if (!payload) return { isSuperAdmin: false, clinicIds: null, email: null, nome: null };
  if (payload.role === "super_admin") {
    return { isSuperAdmin: true, clinicIds: null, email: null, nome: null };
  }
  if (payload.role !== "team_member") {
    return { isSuperAdmin: false, clinicIds: null, email: null, nome: null };
  }
  const email = (payload.email as string | undefined) ?? (payload.sub as string | undefined) ?? null;
  if (!email) return { isSuperAdmin: false, clinicIds: [], email: null, nome: null };
  const rows = await db
    .select({ clinicId: teamTable.clinicId })
    .from(teamTable)
    .where(
      and(
        sql`lower(${teamTable.email}) = lower(${email})`,
        eq(teamTable.temAcessoPlataforma, true),
      ),
    );
  return {
    isSuperAdmin: false,
    clinicIds: Array.from(new Set(rows.map((r) => r.clinicId))),
    email,
    nome: (payload.nome as string | undefined) ?? null,
  };
}
