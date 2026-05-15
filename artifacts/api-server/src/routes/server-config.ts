import { Router, type IRouter } from "express";
import { getConfig, setConfig, deleteConfig, CONFIGURABLE_KEYS, type ConfigKey } from "../lib/config.js";
import { db, serverConfigTable } from "@workspace/db";
import { sendEmailDetailed } from "../lib/email.js";
import { getResendConnectorSettings } from "../lib/replit-connectors.js";
import {
  rotateTokenSigningSecret,
  getTokenSigningSecretSource,
  getTokenSigningSecretLastRotatedAt,
  listTokenSigningSecretRotations,
  EnvSecretRotationError,
} from "../lib/token-secret.js";
import { extractToken, verifyToken } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";

// Environment-variable name to consult as the override source for each
// config key. Must enumerate every key in `ConfigKey` (Drizzle's strict
// `Record` check enforces this at compile time), so adding a new key in
// lib/config.ts immediately surfaces a TypeScript error here.
const ENV_KEYS: Record<ConfigKey, string> = {
  autentique_token: "AUTENTIQUE_TOKEN",
  autentique_webhook_secret: "AUTENTIQUE_WEBHOOK_SECRET",
  supabase_url: "SUPABASE_URL",
  supabase_service_role_key: "SUPABASE_SERVICE_ROLE_KEY",
  resend_api_key: "RESEND_API_KEY",
  resend_from_address: "RESEND_FROM_ADDRESS",
  reply_to_address: "REPLY_TO_ADDRESS",
  app_url: "APP_URL",
  contratada_razao_social: "CONTRATADA_RAZAO_SOCIAL",
  contratada_cnpj: "CONTRATADA_CNPJ",
  contratada_endereco: "CONTRATADA_ENDERECO",
  contratada_cidade_uf: "CONTRATADA_CIDADE_UF",
  contratada_cep: "CONTRATADA_CEP",
  contratada_representante_nome: "CONTRATADA_REPRESENTANTE_NOME",
  contratada_representante_cpf: "CONTRATADA_REPRESENTANTE_CPF",
  contratada_representante_cargo: "CONTRATADA_REPRESENTANTE_CARGO",
  contratada_email_notificacao: "CONTRATADA_EMAIL_NOTIFICACAO",
};

const router: IRouter = Router();

router.get("/admin/config/integrations", async (_req, res): Promise<void> => {
  const rows = await db.select().from(serverConfigTable);
  const dbMap = new Map(rows.map(r => [r.key, r.value]));

  // Resolve once for the whole list. The connectors service is cached
  // internally for 60s so this is cheap on repeat calls.
  const resendConnector = await getResendConnectorSettings();

  const result = CONFIGURABLE_KEYS.map(({ key, label, sensitive, hint }) => {
    const dbValue = dbMap.get(key);
    const envValue = process.env[ENV_KEYS[key]];

    // Only the API key is sourced from the Replit integration. The
    // from-address must point at a domain the operator has verified at
    // Resend (Replit's account email is typically not), so it stays
    // operator-managed via this UI.
    let connectorValue: string | null = null;
    if (resendConnector && key === "resend_api_key") {
      connectorValue = resendConnector.api_key ?? null;
    }

    const hasDbValue = !!dbValue;
    const hasEnvValue = !!envValue;
    const hasConnectorValue = !!connectorValue;
    const configured = hasDbValue || hasEnvValue || hasConnectorValue;
    // Priority must mirror getConfig(): db > env > integration.
    const source: "db" | "env" | "integration" | null = hasDbValue
      ? "db"
      : hasEnvValue
        ? "env"
        : hasConnectorValue
          ? "integration"
          : null;

    let displayValue: string | null = null;
    if (hasDbValue) {
      displayValue = sensitive ? "••••••••" : dbValue!;
    } else if (hasEnvValue) {
      displayValue = sensitive ? "••••••••" : envValue!;
    } else if (hasConnectorValue) {
      displayValue = sensitive ? "••••••••" : connectorValue!;
    }

    return { key, label, sensitive, hint, configured, source, displayValue };
  });

  res.json(result);
});

router.put("/admin/config/integrations/:key", async (req, res): Promise<void> => {
  const key = req.params.key as ConfigKey;
  const validKeys = CONFIGURABLE_KEYS.map(k => k.key);

  if (!validKeys.includes(key)) {
    res.status(400).json({ error: "Chave de configuração inválida" });
    return;
  }

  const { value } = req.body;
  if (typeof value !== "string" || value.trim() === "") {
    res.status(400).json({ error: "Valor inválido" });
    return;
  }

  if (key === "supabase_url") {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(value.trim());
    } catch {
      res.status(400).json({ error: "supabase_url deve ser uma URL válida" });
      return;
    }
    if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname.endsWith(".supabase.co")) {
      res.status(400).json({ error: "supabase_url deve apontar para um projeto Supabase (*.supabase.co)" });
      return;
    }
  }

  // app_url is rendered into the body of every email link (/assinar/<token>,
  // /convite/<token>, etc.). A typo here breaks signing for every recipient,
  // so we validate the shape strictly: must parse as https://, no whitespace
  // or control chars, no path/query/fragment, and the host must look like a
  // normal hostname[:port] (same regex used by resolveAppUrl for Host-header
  // sanitization).
  if (key === "app_url") {
    const trimmed = value.trim();
    if (/[\s\r\n]/.test(trimmed)) {
      res.status(400).json({ error: "URL não pode conter espaços ou quebras de linha" });
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      res.status(400).json({ error: "URL inválida — use o formato https://app.exemplo.com" });
      return;
    }
    if (parsed.protocol !== "https:") {
      res.status(400).json({ error: "URL deve começar com https://" });
      return;
    }
    if (!/^[a-zA-Z0-9.\-]+(:\d{1,5})?$/.test(parsed.host)) {
      res.status(400).json({ error: "Host inválido na URL" });
      return;
    }
    if (
      (parsed.pathname && parsed.pathname !== "/") ||
      parsed.search ||
      parsed.hash
    ) {
      res.status(400).json({ error: "URL deve ser apenas o domínio raiz (sem caminho, query ou fragmento)" });
      return;
    }
    // Persist without a trailing slash so links like `${appUrl}/assinar/...`
    // never produce double-slashes.
    const normalized = `${parsed.protocol}//${parsed.host}`;
    await setConfig(key, normalized);
    res.json({ success: true, key });
    return;
  }

  await setConfig(key, value.trim());
  res.json({ success: true, key });
});

router.delete("/admin/config/integrations/:key", async (req, res): Promise<void> => {
  const key = req.params.key as ConfigKey;
  const validKeys = CONFIGURABLE_KEYS.map(k => k.key);

  if (!validKeys.includes(key)) {
    res.status(400).json({ error: "Chave de configuração inválida" });
    return;
  }

  await deleteConfig(key);
  res.json({ success: true, key });
});

async function handleTestEmail(req: import("express").Request, res: import("express").Response): Promise<void> {
  const { to, subject: customSubject } = req.body as { to?: string; subject?: string };
  if (!to || typeof to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    res.status(400).json({ ok: false, error: "Endereço de e-mail inválido" });
    return;
  }
  const subject = (typeof customSubject === "string" && customSubject.trim().length > 0
    && customSubject.length <= 200 && !/[\r\n]/.test(customSubject))
    ? customSubject.trim()
    : "[IONEX360] Teste de configuração de e-mail";

  const apiKey = await getConfig("resend_api_key");
  if (!apiKey) {
    res.json({ ok: false, error: "Resend API Key não configurado. Salve a chave acima antes de testar." });
    return;
  }

  const fromAddress = (await getConfig("resend_from_address")) ?? "(padrão)";
  const replyTo = await getConfig("reply_to_address");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0a0b0f;color:#e2e8f0;border-radius:12px;">
      <h2 style="color:#3b82f6;margin:0 0 12px 0;">Teste de envio — IONEX360</h2>
      <p style="margin:0 0 12px 0;line-height:1.6;">Este é um e-mail de teste enviado pela tela de Configurações.</p>
      <p style="margin:0 0 6px 0;font-size:13px;color:#94a3b8;"><strong>Remetente:</strong> ${fromAddress}</p>
      <p style="margin:0 0 6px 0;font-size:13px;color:#94a3b8;"><strong>Reply-To:</strong> ${replyTo ?? "(não configurado)"}</p>
      <p style="margin:12px 0 0 0;font-size:13px;color:#94a3b8;">Se você recebeu este e-mail, a configuração do domínio e do Resend está funcionando corretamente.</p>
    </div>
  `;

  const result = await sendEmailDetailed({
    to,
    subject,
    html,
  });

  res.json({
    ok: result.ok,
    error: result.error,
    status: result.status ?? null,
    from: fromAddress,
    replyTo: replyTo ?? null,
    to,
  });
}

// Both endpoints are mounted under requireSuperAdmin via routes/index.ts.
// `/admin/test-email` is the canonical path from the original spec.
// `/admin/config/integrations/test-email` is kept as an alias for the UI
// which lives inside the integrations panel.
router.post("/admin/test-email", handleTestEmail);
router.post("/admin/config/integrations/test-email", handleTestEmail);

// ---------------------------------------------------------------------------
// Resend domain verification status
//
// Surfaces the verification state of the sending domain in the admin panel
// so the operator can see whether DNS (SPF/DKIM) is healthy without leaving
// the app and clicking through to resend.com. The endpoint is a thin proxy
// over Resend's `/domains/:id` API, plus a 30s in-memory cache to avoid
// hammering the upstream when the panel polls.
//
// Domain id resolution (in order):
//   1. RESEND_DOMAIN_ID env (explicit override)
//   2. Domain whose `name` matches the host of `resend_from_address`
//   3. First domain returned by the account (single-domain accounts)
// ---------------------------------------------------------------------------

interface ResendDomainRecord {
  record: string;
  name: string;
  type: string;
  status: string;
  value?: string;
  priority?: number;
}

interface ResendDomain {
  id: string;
  name: string;
  status: string;
  region?: string;
  records?: ResendDomainRecord[];
}

interface DomainStatusCacheEntry {
  fetchedAt: number;
  payload: { name: string; status: string; region: string | null; records: ResendDomainRecord[] };
}

const DOMAIN_STATUS_CACHE_TTL_MS = 30_000;
let domainStatusCache: DomainStatusCacheEntry | null = null;

function invalidateDomainStatusCache(): void {
  domainStatusCache = null;
}

async function getResendApiKey(): Promise<string | null> {
  // Mirror sendEmail()/getConfig() precedence: db > env > integration.
  const fromConfig = await getConfig("resend_api_key");
  if (fromConfig) return fromConfig;
  const connector = await getResendConnectorSettings();
  return connector?.api_key ?? null;
}

async function resolveResendDomain(apiKey: string): Promise<ResendDomain | null> {
  const explicitId = process.env.RESEND_DOMAIN_ID?.trim();
  if (explicitId) {
    const res = await fetch(`https://api.resend.com/domains/${explicitId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) return (await res.json()) as ResendDomain;
    logger.warn({ status: res.status }, "Resend domain lookup by RESEND_DOMAIN_ID failed");
  }

  const listRes = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!listRes.ok) {
    logger.warn({ status: listRes.status }, "Resend /domains list failed");
    return null;
  }
  const listBody = (await listRes.json()) as { data?: ResendDomain[] };
  const domains = listBody.data ?? [];
  if (domains.length === 0) return null;

  const fromAddress = await getConfig("resend_from_address");
  let targetName: string | null = null;
  if (fromAddress) {
    const m = fromAddress.match(/<?([^@<>\s]+)@([^>\s]+)>?\s*$/);
    if (m) targetName = m[2].toLowerCase();
  }

  let pick = domains[0]!;
  if (targetName) {
    const match = domains.find(d => d.name.toLowerCase() === targetName);
    if (match) pick = match;
  }

  // The list endpoint doesn't include `records`, so re-fetch by id to enrich.
  const detailRes = await fetch(`https://api.resend.com/domains/${pick.id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (detailRes.ok) return (await detailRes.json()) as ResendDomain;
  return pick;
}

router.get("/admin/resend/domain-status", async (_req, res): Promise<void> => {
  const now = Date.now();
  if (domainStatusCache && now - domainStatusCache.fetchedAt < DOMAIN_STATUS_CACHE_TTL_MS) {
    res.json(domainStatusCache.payload);
    return;
  }

  const apiKey = await getResendApiKey();
  if (!apiKey) {
    res.status(400).json({ error: "Resend API Key não configurada" });
    return;
  }

  try {
    const domain = await resolveResendDomain(apiKey);
    if (!domain) {
      res.status(404).json({ error: "Nenhum domínio cadastrado no Resend para esta conta" });
      return;
    }

    const payload = {
      name: domain.name,
      status: domain.status,
      region: domain.region ?? null,
      records: (domain.records ?? []).map(r => ({
        record: r.record,
        name: r.name,
        type: r.type,
        status: r.status,
        ...(r.value !== undefined ? { value: r.value } : {}),
        ...(r.priority !== undefined ? { priority: r.priority } : {}),
      })),
    };
    domainStatusCache = { fetchedAt: now, payload };
    res.json(payload);
  } catch (err) {
    logger.error({ err }, "Failed to fetch Resend domain status");
    res.status(502).json({ error: "Falha ao consultar status do domínio no Resend" });
  }
});

router.post("/admin/resend/verify-domain", async (_req, res): Promise<void> => {
  const apiKey = await getResendApiKey();
  if (!apiKey) {
    res.status(400).json({ error: "Resend API Key não configurada" });
    return;
  }

  try {
    const domain = await resolveResendDomain(apiKey);
    if (!domain) {
      res.status(404).json({ error: "Nenhum domínio cadastrado no Resend para esta conta" });
      return;
    }

    const verifyRes = await fetch(`https://api.resend.com/domains/${domain.id}/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!verifyRes.ok) {
      const body = await verifyRes.text().catch(() => "");
      logger.warn({ status: verifyRes.status, body: body.slice(0, 300) }, "Resend domain verify failed");
      res.status(502).json({ error: "Resend recusou a verificação. Confirme se os registros DNS já propagaram." });
      return;
    }

    invalidateDomainStatusCache();
    res.json({ ok: true, domainId: domain.id, name: domain.name });
  } catch (err) {
    logger.error({ err }, "Failed to trigger Resend domain verification");
    res.status(502).json({ error: "Falha ao acionar verificação no Resend" });
  }
});

router.get("/admin/token-signing-secret/status", async (_req, res): Promise<void> => {
  const source = getTokenSigningSecretSource();
  // The `updated_at` column on the server_config row is bumped on every
  // rotation (see token-secret.ts) and on the initial bootstrap insert,
  // so it doubles as a "last rotated at" timestamp regardless of whether
  // rotation was triggered manually or auto-bootstrapped on first boot.
  const lastRotatedAt = await getTokenSigningSecretLastRotatedAt();
  res.json({
    source,
    canRotate: source === "db",
    lastRotatedAt: lastRotatedAt ? lastRotatedAt.toISOString() : null,
  });
});

router.get("/admin/token-signing-secret/rotations", async (_req, res): Promise<void> => {
  try {
    const rotations = await listTokenSigningSecretRotations(10);
    res.json(rotations);
  } catch (err) {
    // Tolerate the case where the schema migration that creates
    // `token_secret_rotations` hasn't run yet (e.g. partial deploy where the
    // app code is live but `pnpm --filter @workspace/db push` hasn't been
    // executed). Returning an empty list keeps the Security card usable
    // instead of breaking the whole admin page with a 500.
    const code = (err as { code?: string } | null)?.code;
    if (code === "42P01") {
      logger.warn(
        "token_secret_rotations table is missing — returning empty rotation history. Run `pnpm --filter @workspace/db push` to apply the schema.",
      );
      res.json([]);
      return;
    }
    throw err;
  }
});

router.post("/admin/rotate-token-signing-secret", async (req, res): Promise<void> => {
  // requireSuperAdmin (mounted at the router level) already verified the
  // caller, but it does not stash the JWT payload on the request, so
  // re-extract it here purely to attribute the audit-log entry. The
  // verification is cheap (HMAC) and worst case (token went invalid in the
  // microseconds between checks) we just record a null actor.
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;
  const actor = {
    role: typeof payload?.role === "string" ? payload.role : null,
    email: typeof payload?.email === "string" ? payload.email : null,
    sub: typeof payload?.sub === "string" ? payload.sub : null,
  };

  try {
    await rotateTokenSigningSecret(actor);
    res.json({ success: true });
  } catch (err) {
    if (err instanceof EnvSecretRotationError) {
      res.status(409).json({ success: false, error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : "Erro ao rotacionar segredo";
    logger.error({ err }, "Failed to rotate token signing secret");
    res.status(500).json({ success: false, error: msg });
  }
});

router.post("/admin/config/integrations/test-autentique", async (_req, res): Promise<void> => {
  const token = await getConfig("autentique_token");
  if (!token) {
    res.status(400).json({ ok: false, error: "AUTENTIQUE_TOKEN não configurado" });
    return;
  }

  try {
    const response = await fetch("https://api.autentique.com.br/v2/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "{ me { name email } }" }),
    });

    const data = await response.json() as {
      data?: { me?: { name: string; email: string } };
      errors?: Array<{ message: string }>;
    };

    if (data.errors || !data.data?.me) {
      const msg = data.errors?.[0]?.message ?? "Resposta inválida da API";
      res.json({ ok: false, error: msg });
      return;
    }

    res.json({ ok: true, user: data.data.me });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro de conexão";
    res.json({ ok: false, error: msg });
  }
});

export default router;
