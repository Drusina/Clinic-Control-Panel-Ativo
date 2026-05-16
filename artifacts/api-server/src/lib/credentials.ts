import bcrypt from "bcryptjs";
import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db, teamCredentialsTable, teamTable } from "@workspace/db";

const BCRYPT_COST = 12;

/** Caracteres "legíveis" — sem 0/O/1/l/I para evitar ambiguidade na leitura. */
const READABLE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function generateProvisionalPassword(length = 12): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += READABLE_CHARS[bytes[i] % READABLE_CHARS.length];
  }
  return out;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Reset token format: 32 random bytes, base64url. The hash (sha256) is what
 * we store. The plain token only travels in the e-mail.
 */
export interface ResetTokenPair {
  token: string;
  hash: string;
  expiresAt: Date;
}

export function generateResetToken(ttlMs = 60 * 60 * 1000): ResetTokenPair {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash, expiresAt: new Date(Date.now() + ttlMs) };
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Upsert a credential row by normalized email, replacing the password hash
 * and (optionally) marking it as provisional. Clears reset tokens.
 */
export async function upsertCredential(params: {
  email: string;
  passwordHash: string;
  provisional: boolean;
}): Promise<void> {
  const emailNormalized = normalizeEmail(params.email);
  const now = new Date();
  await db
    .insert(teamCredentialsTable)
    .values({
      emailNormalized,
      senhaHash: params.passwordHash,
      senhaProvisoria: params.provisional,
      senhaAlteradaEm: params.provisional ? null : now,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: teamCredentialsTable.emailNormalized,
      set: {
        senhaHash: params.passwordHash,
        senhaProvisoria: params.provisional,
        senhaAlteradaEm: params.provisional ? null : now,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: now,
      },
    });
}

export async function findCredentialByEmail(email: string) {
  const emailNormalized = normalizeEmail(email);
  const rows = await db
    .select()
    .from(teamCredentialsTable)
    .where(eq(teamCredentialsTable.emailNormalized, emailNormalized))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Returns true if at least one `equipe_interna` row with this e-mail has
 * `tem_acesso_plataforma = true`. Used by /esqueci-senha and as a safety
 * check on login (revogação manual derruba todos os logins futuros).
 */
export async function hasPlatformAccess(email: string): Promise<boolean> {
  const emailNormalized = normalizeEmail(email);
  const rows = await db
    .select({ id: teamTable.id })
    .from(teamTable)
    .where(
      sql`lower(${teamTable.email}) = ${emailNormalized} AND ${teamTable.temAcessoPlataforma} = true`,
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Return the `nome` for an e-mail (any clinic) so we can personalize emails.
 * Returns the first row found, by createdAt.
 */
export async function findDisplayName(email: string): Promise<string | null> {
  const emailNormalized = normalizeEmail(email);
  const rows = await db
    .select({ nome: teamTable.nome })
    .from(teamTable)
    .where(sql`lower(${teamTable.email}) = ${emailNormalized}`)
    .limit(1);
  return rows[0]?.nome ?? null;
}
