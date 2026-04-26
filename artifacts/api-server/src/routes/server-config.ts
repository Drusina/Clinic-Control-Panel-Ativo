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

const ENV_KEYS: Record<ConfigKey, string> = {
  autentique_token: "AUTENTIQUE_TOKEN",
  autentique_webhook_secret: "AUTENTIQUE_WEBHOOK_SECRET",
  supabase_url: "SUPABASE_URL",
  supabase_service_role_key: "SUPABASE_SERVICE_ROLE_KEY",
  resend_api_key: "RESEND_API_KEY",
  resend_from_address: "RESEND_FROM_ADDRESS",
  reply_to_address: "REPLY_TO_ADDRESS",
  app_url: "APP_URL",
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
