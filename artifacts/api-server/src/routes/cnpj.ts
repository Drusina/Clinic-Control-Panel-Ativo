import { Router, type IRouter } from "express";

const router: IRouter = Router();

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 1_000;

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheGet(cnpj: string): CacheEntry | undefined {
  const entry = cache.get(cnpj);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(cnpj);
    return undefined;
  }
  cache.delete(cnpj);
  cache.set(cnpj, entry);
  return entry;
}

function cacheSet(cnpj: string, entry: CacheEntry): void {
  if (cache.has(cnpj)) {
    cache.delete(cnpj);
  } else if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value as string;
    cache.delete(oldestKey);
  }
  cache.set(cnpj, entry);
}

router.get("/cnpj/:cnpj", async (req, res): Promise<void> => {
  const cnpj = req.params.cnpj.replace(/\D/g, "");

  if (cnpj.length !== 14) {
    res.status(400).json({ error: "CNPJ deve ter 14 dígitos" });
    return;
  }

  const cached = cacheGet(cnpj);
  if (cached) {
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
    cacheSet(cnpj, { data, expiresAt: Date.now() + TTL_MS });
    res.json(data);
  } catch {
    res.status(502).json({ error: "Erro de conexão ao consultar a Receita Federal." });
  }
});

export default router;
