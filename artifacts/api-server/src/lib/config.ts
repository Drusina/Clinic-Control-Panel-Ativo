import { eq } from "drizzle-orm";
import { db, serverConfigTable } from "@workspace/db";

const CONFIG_KEYS = {
  autentique_token: "AUTENTIQUE_TOKEN",
  autentique_webhook_secret: "AUTENTIQUE_WEBHOOK_SECRET",
  supabase_url: "SUPABASE_URL",
  supabase_service_role_key: "SUPABASE_SERVICE_ROLE_KEY",
} as const;

export type ConfigKey = keyof typeof CONFIG_KEYS;

const cache = new Map<ConfigKey, string | null>();
const CACHE_TTL_MS = 30_000;
const cacheTimestamps = new Map<ConfigKey, number>();

export async function getConfig(key: ConfigKey): Promise<string | null> {
  const now = Date.now();
  const cachedAt = cacheTimestamps.get(key) ?? 0;
  if (cache.has(key) && now - cachedAt < CACHE_TTL_MS) {
    return cache.get(key) ?? null;
  }

  try {
    const [row] = await db
      .select()
      .from(serverConfigTable)
      .where(eq(serverConfigTable.key, key));

    if (row?.value) {
      cache.set(key, row.value);
      cacheTimestamps.set(key, now);
      return row.value;
    }
  } catch {
    // fall through to env var
  }

  const envVal = process.env[CONFIG_KEYS[key]] ?? null;
  cache.set(key, envVal);
  cacheTimestamps.set(key, now);
  return envVal;
}

export function invalidateConfigCache(key?: ConfigKey) {
  if (key) {
    cache.delete(key);
    cacheTimestamps.delete(key);
  } else {
    cache.clear();
    cacheTimestamps.clear();
  }
}

export async function setConfig(key: ConfigKey, value: string): Promise<void> {
  await db
    .insert(serverConfigTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: serverConfigTable.key, set: { value, updatedAt: new Date() } });
  invalidateConfigCache(key);
}

export async function deleteConfig(key: ConfigKey): Promise<void> {
  await db.delete(serverConfigTable).where(eq(serverConfigTable.key, key));
  invalidateConfigCache(key);
}

export const CONFIGURABLE_KEYS: Array<{ key: ConfigKey; label: string; sensitive: boolean; hint: string }> = [
  {
    key: "autentique_token",
    label: "Autentique API Token",
    sensitive: true,
    hint: "Token de acesso à API Autentique (https://app.autentique.com.br/dashboard/tokens)",
  },
  {
    key: "autentique_webhook_secret",
    label: "Autentique Webhook Secret",
    sensitive: true,
    hint: "Segredo configurado no webhook do Autentique para validar chamadas recebidas",
  },
  {
    key: "supabase_url",
    label: "Supabase URL",
    sensitive: false,
    hint: "URL do projeto Supabase (ex: https://xxx.supabase.co)",
  },
  {
    key: "supabase_service_role_key",
    label: "Supabase Service Role Key",
    sensitive: true,
    hint: "Chave de service role do Supabase (Project Settings → API)",
  },
];
