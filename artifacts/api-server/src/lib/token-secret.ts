import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db, serverConfigTable } from "@workspace/db";
import { logger } from "./logger.js";

const CONFIG_KEY = "token_signing_secret";

let cachedSecret: string | null = null;

async function loadFromDb(): Promise<string | null> {
  const [row] = await db
    .select()
    .from(serverConfigTable)
    .where(eq(serverConfigTable.key, CONFIG_KEY));
  return row?.value ?? null;
}

async function persistIfAbsent(value: string): Promise<void> {
  // Insert-if-absent so that concurrent first-boots across multiple instances
  // (e.g. Autoscale cold start with > 1 replica) do not overwrite each other's
  // candidate secret. The caller MUST re-read after this to obtain the
  // canonical value that actually got stored.
  await db
    .insert(serverConfigTable)
    .values({ key: CONFIG_KEY, value })
    .onConflictDoNothing({ target: serverConfigTable.key });
}

function generateSecret(): string {
  return randomBytes(48).toString("base64");
}

export async function initTokenSigningSecret(): Promise<void> {
  if (cachedSecret) return;

  const envValue = process.env.TOKEN_SIGNING_SECRET ?? "";
  const adminValue = process.env.SUPER_ADMIN_SECRET ?? "";
  const envIsUsable = envValue.length > 0 && envValue !== adminValue;

  if (envIsUsable) {
    cachedSecret = envValue;
    logger.info("Token signing secret loaded from TOKEN_SIGNING_SECRET env var");
    return;
  }

  // Explain *why* the env var was rejected so operators reading deploy logs
  // know whether they need to act or whether the auto-bootstrap is fine.
  const reason =
    envValue.length === 0
      ? "TOKEN_SIGNING_SECRET is not set (or is empty)"
      : "TOKEN_SIGNING_SECRET is set but equals SUPER_ADMIN_SECRET, which would defeat privilege separation between admin login and token signing";

  const dbValue = await loadFromDb();
  if (dbValue && dbValue.length > 0 && dbValue !== adminValue) {
    cachedSecret = dbValue;
    logger.warn(
      { reason },
      "Token signing secret loaded from server_config (DB-stored fallback) because the env-provided value is misconfigured. Existing user sessions are preserved, but please set TOKEN_SIGNING_SECRET in Deployments → Secrets to a strong random 32+ char value DIFFERENT from SUPER_ADMIN_SECRET.",
    );
    return;
  }

  // First boot (or DB row was somehow equal to admin secret): generate a
  // candidate, attempt to persist it without overwriting any concurrent
  // winner, then re-read to obtain the canonical value chosen by the DB.
  const candidate = generateSecret();
  await persistIfAbsent(candidate);
  const canonical = await loadFromDb();
  if (!canonical || canonical.length === 0) {
    throw new Error(
      [
        "Failed to bootstrap token_signing_secret in the server_config table: insert returned no row on re-read.",
        "This usually means the database is unreachable or the migration that creates server_config has not run yet.",
        "Workaround: set TOKEN_SIGNING_SECRET in the Deployments Secrets panel to a strong random value (32+ chars)",
        "that is DIFFERENT from SUPER_ADMIN_SECRET, then re-deploy. Generate one with:",
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"",
      ].join(" "),
    );
  }
  cachedSecret = canonical;
  logger.warn(
    { reason },
    [
      "Token signing secret was bootstrapped into server_config because no usable env-provided secret was available.",
      "This is safe and the deploy will continue, but it means user sessions live in the database, not in your env config.",
      "To take ownership of the secret (recommended for production): set TOKEN_SIGNING_SECRET in Deployments → Secrets to a",
      "strong random 32+ char value DIFFERENT from SUPER_ADMIN_SECRET — for example:",
      "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"",
      "To rotate the bootstrapped value, delete the 'token_signing_secret' row from server_config and restart the server.",
    ].join(" "),
  );
}

export function getTokenSigningSecret(): string {
  if (!cachedSecret) {
    throw new Error(
      "Token signing secret not initialized. Call initTokenSigningSecret() during startup before handling requests.",
    );
  }
  return cachedSecret;
}
