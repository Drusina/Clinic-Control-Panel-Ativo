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
 *
 * Security: the URL must be **decoded** before regex matching. Otherwise an
 * attacker can percent-encode characters of the UUID (e.g. `%2d` for `-`) so
 * the regex no longer matches, the middleware falls through to `next()`,
 * and the request bypasses clinic-access enforcement entirely. We also flag
 * paths that *look* clinic-scoped (`/clinics/<anything>`) but contain a
 * non-UUID segment so we can deny them outright instead of falling through.
 */
// Both regexes are intentionally case-insensitive: Express defaults to
// case-insensitive routing (`case sensitive routing` is off), so a request
// to `/api/CLINICS/<uuid>/...` would still resolve to the same handler — we
// must therefore detect "clinic-scoped" identically to Express, otherwise an
// attacker could bypass the access check by varying the casing of the path.
const CLINIC_UUID_RE = /\/clinics\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:\/|$)/i;
const CLINIC_ANY_RE = /\/clinics\/([^/?#]+)/i;

function safeDecodeUrl(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Strip the query string and fragment from a URL so the regex above only
 * inspects the pathname. Otherwise a benign query like `?foo=/clinics/xyz`
 * could trigger spurious matches.
 */
function pathnameOnly(url: string): string {
  const qIdx = url.indexOf("?");
  const hIdx = url.indexOf("#");
  let end = url.length;
  if (qIdx >= 0) end = Math.min(end, qIdx);
  if (hIdx >= 0) end = Math.min(end, hIdx);
  return url.slice(0, end);
}

interface ClinicContext {
  clinicId?: string;
  /**
   * True when the URL targets a clinic-scoped route (i.e. contains
   * `/clinics/<segment>`). When `clinicId` is undefined and this is true,
   * the segment was not a valid UUID — likely a tampering attempt — and
   * the request must be denied rather than allowed to fall through.
   */
  isClinicScoped: boolean;
}

function extractClinicContext(req: Request): ClinicContext {
  const cid = req.params.clinicId;
  if (typeof cid === "string" && cid.length > 0) {
    return { clinicId: cid, isClinicScoped: true };
  }
  const id = req.params.id;
  if (typeof id === "string" && id.length > 0) {
    return { clinicId: id, isClinicScoped: true };
  }
  const raw = req.originalUrl || req.url || "";
  // 1. Drop query/fragment so they can't influence the regex.
  // 2. Decode once to neutralise single-pass percent-encoding attacks
  //    (e.g. `%2d` instead of `-`). Express only decodes route params when
  //    matching, not the full URL, so without this step encoded UUIDs would
  //    slip past the regex below.
  const decoded = safeDecodeUrl(pathnameOnly(raw));
  const matchUuid = CLINIC_UUID_RE.exec(decoded);
  if (matchUuid) return { clinicId: matchUuid[1], isClinicScoped: true };
  // Path mentions `/clinics/<segment>` but the segment isn't a valid UUID.
  // Flag the request as clinic-scoped (so callers deny it) instead of
  // letting it fall through unprotected.
  if (CLINIC_ANY_RE.test(decoded)) return { isClinicScoped: true };
  return { isClinicScoped: false };
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

  const ctx = extractClinicContext(req);
  if (!ctx.clinicId) {
    if (ctx.isClinicScoped) {
      // The URL targets a clinic-scoped route but the segment after
      // `/clinics/` isn't a valid UUID — almost always a tampering attempt
      // (e.g. percent-encoded characters trying to slip past the regex).
      // Refuse rather than fall through.
      res.status(400).json({ error: "Identificação de clínica inválida" });
      return;
    }
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

  const clinicId = ctx.clinicId;
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
