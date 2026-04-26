import { eq } from "drizzle-orm";
import { db, serverConfigTable } from "@workspace/db";
import { getResendConnectorSettings } from "./replit-connectors.js";

const CONFIG_KEYS = {
  autentique_token: "AUTENTIQUE_TOKEN",
  autentique_webhook_secret: "AUTENTIQUE_WEBHOOK_SECRET",
  supabase_url: "SUPABASE_URL",
  supabase_service_role_key: "SUPABASE_SERVICE_ROLE_KEY",
  resend_api_key: "RESEND_API_KEY",
  resend_from_address: "RESEND_FROM_ADDRESS",
  reply_to_address: "REPLY_TO_ADDRESS",
  app_url: "APP_URL",
  // ─── Dados da Contratada (BLU SOLLUTTIONS / IONEX360) ───
  contratada_razao_social: "CONTRATADA_RAZAO_SOCIAL",
  contratada_cnpj: "CONTRATADA_CNPJ",
  contratada_endereco: "CONTRATADA_ENDERECO",
  contratada_cidade_uf: "CONTRATADA_CIDADE_UF",
  contratada_cep: "CONTRATADA_CEP",
  contratada_representante_nome: "CONTRATADA_REPRESENTANTE_NOME",
  contratada_representante_cpf: "CONTRATADA_REPRESENTANTE_CPF",
  contratada_representante_cargo: "CONTRATADA_REPRESENTANTE_CARGO",
  contratada_email_notificacao: "CONTRATADA_EMAIL_NOTIFICACAO",
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

  const envVal = process.env[CONFIG_KEYS[key]];
  if (envVal) {
    cache.set(key, envVal);
    cacheTimestamps.set(key, now);
    return envVal;
  }

  // Replit-managed Resend connector fallback. Operator overrides via DB or env
  // var always take priority (above) so they can still drop in their own key
  // for testing.
  //
  // We deliberately only source the API key from the integration — not the
  // from-address. The Replit integration's `from_email` is whatever Replit
  // account-email the user signed up with (e.g. a personal gmail), but Resend
  // rejects sends from any unverified domain. The from-address is tied to the
  // operator's verified Resend domain, so it stays operator-managed via the
  // admin UI; when blank, sendEmail() falls back to Resend's sandbox sender.
  if (key === "resend_api_key") {
    const settings = await getResendConnectorSettings();
    if (settings?.api_key) {
      cache.set(key, settings.api_key);
      cacheTimestamps.set(key, now);
      return settings.api_key;
    }
  }

  cache.set(key, null);
  cacheTimestamps.set(key, now);
  return null;
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

export interface ConfigurableKeyEntry {
  key: ConfigKey;
  label: string;
  sensitive: boolean;
  hint: string;
  group?: "integracoes" | "contratada";
}

export const CONFIGURABLE_KEYS: ConfigurableKeyEntry[] = [
  {
    key: "resend_api_key",
    label: "Resend API Key",
    sensitive: true,
    hint: "Chave de API do Resend (https://resend.com/api-keys) — necessária para envio de e-mails",
    group: "integracoes",
  },
  {
    key: "resend_from_address",
    label: "Endereço remetente (From)",
    sensitive: false,
    hint: 'E-mail remetente verificado no Resend. Ex: "IONEX360 <noreply@clinionex.com.br>"',
    group: "integracoes",
  },
  {
    key: "reply_to_address",
    label: "Endereço de resposta (Reply-To)",
    sensitive: false,
    hint: "E-mail para o qual respostas dos destinatários serão direcionadas. Ex: gestor@blusolution.com.br",
    group: "integracoes",
  },
  {
    key: "app_url",
    label: "URL pública da plataforma",
    sensitive: false,
    hint: "URL base da plataforma usada nos links dos e-mails. Ex: https://app.clinionex.com.br",
    group: "integracoes",
  },
  // ─── Dados da Contratada (IONEX360) ───
  {
    key: "contratada_razao_social",
    label: "Razão Social",
    sensitive: false,
    hint: "Razão social da empresa que opera a plataforma. Aparece em todos os documentos LGPD.",
    group: "contratada",
  },
  {
    key: "contratada_cnpj",
    label: "CNPJ",
    sensitive: false,
    hint: "CNPJ da Contratada. Ex: 55.190.026/0001-31",
    group: "contratada",
  },
  {
    key: "contratada_endereco",
    label: "Endereço completo",
    sensitive: false,
    hint: "Logradouro, número, complemento. Ex: Av. Brasil 2125, sala 04-A",
    group: "contratada",
  },
  {
    key: "contratada_cidade_uf",
    label: "Cidade / UF",
    sensitive: false,
    hint: "Ex: Sorriso/MT",
    group: "contratada",
  },
  {
    key: "contratada_cep",
    label: "CEP",
    sensitive: false,
    hint: "Ex: 78.890-126",
    group: "contratada",
  },
  {
    key: "contratada_representante_nome",
    label: "Representante legal — Nome",
    sensitive: false,
    hint: "Nome completo do representante que assina pela Contratada. Ex: Rafaela Calgaro",
    group: "contratada",
  },
  {
    key: "contratada_representante_cpf",
    label: "Representante legal — CPF",
    sensitive: false,
    hint: "Ex: 032.539.209-92",
    group: "contratada",
  },
  {
    key: "contratada_representante_cargo",
    label: "Representante legal — Cargo",
    sensitive: false,
    hint: "Ex: Sócia-Administradora",
    group: "contratada",
  },
  {
    key: "contratada_email_notificacao",
    label: "E-mail para notificações de assinatura",
    sensitive: false,
    hint: "E-mail do operador que recebe a notificação quando um termo é assinado. Ex: gestor@blusolution.com.br",
    group: "contratada",
  },
  // ─── Legados ─── (mantidos para não quebrar referências; ocultos da UI)
  {
    key: "autentique_token",
    label: "Autentique API Token (legado)",
    sensitive: true,
    hint: "Não utilizado — assinatura agora é hospedada na própria plataforma.",
  },
  {
    key: "autentique_webhook_secret",
    label: "Autentique Webhook Secret (legado)",
    sensitive: true,
    hint: "Não utilizado.",
  },
  {
    key: "supabase_url",
    label: "Supabase URL (legado)",
    sensitive: false,
    hint: "Não utilizado.",
  },
  {
    key: "supabase_service_role_key",
    label: "Supabase Service Role Key (legado)",
    sensitive: true,
    hint: "Não utilizado.",
  },
];
