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

  const dbValue = await loadFromDb();
  if (dbValue && dbValue.length > 0 && dbValue !== adminValue) {
    cachedSecret = dbValue;
    logger.info(
      "Token signing secret loaded from server_config (env var unset or matches SUPER_ADMIN_SECRET)",
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
      "Failed to bootstrap token_signing_secret: insert returned no row on re-read",
    );
  }
  cachedSecret = canonical;
  logger.warn(
    "Token signing secret was missing or matched SUPER_ADMIN_SECRET; bootstrapped a new value into server_config. To rotate, delete the 'token_signing_secret' row and restart.",
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
