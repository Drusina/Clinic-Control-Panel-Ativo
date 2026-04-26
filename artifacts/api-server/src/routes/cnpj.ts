import { Router, type IRouter } from "express";

const router: IRouter = Router();

const TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

router.get("/cnpj/:cnpj", async (req, res): Promise<void> => {
  const cnpj = req.params.cnpj.replace(/\D/g, "");

  if (cnpj.length !== 14) {
    res.status(400).json({ error: "CNPJ deve ter 14 dígitos" });
    return;
  }

  const cached = cache.get(cnpj);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.data);
    return;
  }

  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; IONEX360/1.0)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 404) {
      res.status(404).json({ error: "CNPJ não encontrado na Receita Federal." });
      return;
    }

    if (!response.ok) {
      res.status(502).json({ error: "Erro ao consultar a Receita Federal. Tente novamente." });
      return;
    }

    const data = await response.json();
    cache.set(cnpj, { data, expiresAt: Date.now() + TTL_MS });
    res.json(data);
  } catch {
    res.status(502).json({ error: "Erro de conexão ao consultar a Receita Federal." });
  }
});

export default router;
