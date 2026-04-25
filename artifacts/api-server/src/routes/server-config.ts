import { Router, type IRouter } from "express";
import { getConfig, setConfig, deleteConfig, CONFIGURABLE_KEYS, type ConfigKey } from "../lib/config.js";
import { db, serverConfigTable } from "@workspace/db";

const ENV_KEYS: Record<ConfigKey, string> = {
  autentique_token: "AUTENTIQUE_TOKEN",
  autentique_webhook_secret: "AUTENTIQUE_WEBHOOK_SECRET",
  supabase_url: "SUPABASE_URL",
  supabase_service_role_key: "SUPABASE_SERVICE_ROLE_KEY",
};

const router: IRouter = Router();

router.get("/admin/config/integrations", async (_req, res): Promise<void> => {
  const rows = await db.select().from(serverConfigTable);
  const dbMap = new Map(rows.map(r => [r.key, r.value]));

  const result = CONFIGURABLE_KEYS.map(({ key, label, sensitive, hint }) => {
    const dbValue = dbMap.get(key);
    const envValue = process.env[ENV_KEYS[key]];
    const hasDbValue = !!dbValue;
    const hasEnvValue = !!envValue;
    const configured = hasDbValue || hasEnvValue;
    const source = hasDbValue ? "db" : hasEnvValue ? "env" : null;

    let displayValue: string | null = null;
    if (hasDbValue) {
      displayValue = sensitive ? "••••••••" : dbValue!;
    } else if (hasEnvValue) {
      displayValue = sensitive ? "••••••••" : envValue!;
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
