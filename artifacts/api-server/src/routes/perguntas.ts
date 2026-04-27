import { Router, type IRouter } from "express";
import { db, perguntasTable, respostasTable, diagnosticsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { recalculateScores } from "../lib/score-calculator";
import { assertClinicAccess } from "../middleware/auth";

/**
 * Helper: resolve the clinic id from a diagnostic id, then enforce access.
 * The /diagnostics/:diagnosticoId/respostas endpoints are not naturally
 * scoped by clinic in the URL, so we look up the diagnostic first.
 * Returns true if the response was already sent (caller should `return`).
 */
async function assertAccessByDiagnostic(
  req: Parameters<typeof assertClinicAccess>[0],
  res: Parameters<typeof assertClinicAccess>[1],
  diagnosticoId: string,
): Promise<boolean> {
  const [d] = await db
    .select({ clinicId: diagnosticsTable.clinicId })
    .from(diagnosticsTable)
    .where(eq(diagnosticsTable.id, diagnosticoId));
  if (!d) {
    res.status(404).json({ error: "Diagnostic not found" });
    return true;
  }
  return assertClinicAccess(req, res, d.clinicId);
}

const router: IRouter = Router();

router.get("/diagnostic/pillars", async (_req, res): Promise<void> => {
  const all = await db
    .select({
      pilarSlug: perguntasTable.pilarSlug,
      pilarNome: perguntasTable.pilarNome,
      pilarOrdem: perguntasTable.pilarOrdem,
    })
    .from(perguntasTable)
    .orderBy(perguntasTable.pilarOrdem);

  const seen = new Set<string>();
  const pillars: { slug: string; nome: string; ordem: number; questionCount: number }[] = [];
  const countMap: Record<string, number> = {};
  for (const row of all) {
    countMap[row.pilarSlug] = (countMap[row.pilarSlug] ?? 0) + 1;
    if (!seen.has(row.pilarSlug)) {
      seen.add(row.pilarSlug);
      pillars.push({ slug: row.pilarSlug, nome: row.pilarNome, ordem: row.pilarOrdem, questionCount: 0 });
    }
  }
  for (const p of pillars) {
    p.questionCount = countMap[p.slug] ?? 0;
  }

  res.json(pillars);
});

router.get("/diagnostic/pillars/:pillarSlug/questions", async (req, res): Promise<void> => {
  const pillarSlug = Array.isArray(req.params.pillarSlug)
    ? req.params.pillarSlug[0]
    : req.params.pillarSlug;

  const perguntas = await db
    .select()
    .from(perguntasTable)
    .where(eq(perguntasTable.pilarSlug, pillarSlug))
    .orderBy(perguntasTable.ordem);

  res.json(
    perguntas.map((p) => ({
      id: p.id,
      pilarSlug: p.pilarSlug,
      pilarNome: p.pilarNome,
      pilarOrdem: p.pilarOrdem,
      texto: p.texto,
      tipo: p.tipo,
      peso: Number(p.peso),
      ordem: p.ordem,
      dica: p.dica,
      valorMin: p.valorMin != null ? Number(p.valorMin) : null,
      valorMax: p.valorMax != null ? Number(p.valorMax) : null,
      inverso: p.inverso,
    }))
  );
});

router.get("/perguntas", async (req, res): Promise<void> => {
  const perguntas = await db
    .select()
    .from(perguntasTable)
    .orderBy(perguntasTable.pilarOrdem, perguntasTable.ordem);

  res.json(
    perguntas.map((p) => ({
      id: p.id,
      pilarSlug: p.pilarSlug,
      pilarNome: p.pilarNome,
      pilarOrdem: p.pilarOrdem,
      texto: p.texto,
      tipo: p.tipo,
      peso: Number(p.peso),
      ordem: p.ordem,
      dica: p.dica,
      valorMin: p.valorMin != null ? Number(p.valorMin) : null,
      valorMax: p.valorMax != null ? Number(p.valorMax) : null,
      inverso: p.inverso,
    }))
  );
});

router.get("/diagnostics/:diagnosticoId/respostas", async (req, res): Promise<void> => {
  const diagnosticoId = Array.isArray(req.params.diagnosticoId)
    ? req.params.diagnosticoId[0]
    : req.params.diagnosticoId;
  if (await assertAccessByDiagnostic(req, res, diagnosticoId)) return;

  const respostas = await db
    .select()
    .from(respostasTable)
    .where(eq(respostasTable.diagnosticoId, diagnosticoId));

  res.json(
    respostas.map((r) => ({
      id: r.id,
      diagnosticoId: r.diagnosticoId,
      perguntaId: r.perguntaId,
      valor: r.valor,
      respondidoEm: r.respondidoEm.toISOString(),
    }))
  );
});

router.put("/diagnostics/:diagnosticoId/respostas/:perguntaId", async (req, res): Promise<void> => {
  const diagnosticoId = Array.isArray(req.params.diagnosticoId)
    ? req.params.diagnosticoId[0]
    : req.params.diagnosticoId;
  const perguntaId = Array.isArray(req.params.perguntaId)
    ? req.params.perguntaId[0]
    : req.params.perguntaId;
  if (await assertAccessByDiagnostic(req, res, diagnosticoId)) return;

  const { valor } = req.body;
  if (valor === undefined || valor === null) {
    res.status(400).json({ error: "valor is required" });
    return;
  }

  const now = new Date();
  const [resposta] = await db
    .insert(respostasTable)
    .values({ diagnosticoId, perguntaId, valor: String(valor), respondidoEm: now })
    .onConflictDoUpdate({
      target: [respostasTable.diagnosticoId, respostasTable.perguntaId],
      set: { valor: String(valor), respondidoEm: now, updatedAt: now },
    })
    .returning();

  recalculateScores(diagnosticoId).catch(() => {});

  res.json({
    id: resposta.id,
    diagnosticoId: resposta.diagnosticoId,
    perguntaId: resposta.perguntaId,
    valor: resposta.valor,
    respondidoEm: resposta.respondidoEm.toISOString(),
  });
});

router.post("/diagnostics/:diagnosticoId/respostas/batch", async (req, res): Promise<void> => {
  const diagnosticoId = Array.isArray(req.params.diagnosticoId)
    ? req.params.diagnosticoId[0]
    : req.params.diagnosticoId;
  if (await assertAccessByDiagnostic(req, res, diagnosticoId)) return;

  const { respostas } = req.body as { respostas: Array<{ perguntaId: string; valor: string }> };
  if (!Array.isArray(respostas) || respostas.length === 0) {
    res.status(400).json({ error: "respostas array is required" });
    return;
  }

  const now = new Date();
  const saved = await Promise.all(
    respostas.map(({ perguntaId, valor }) =>
      db
        .insert(respostasTable)
        .values({ diagnosticoId, perguntaId, valor: String(valor), respondidoEm: now })
        .onConflictDoUpdate({
          target: [respostasTable.diagnosticoId, respostasTable.perguntaId],
          set: { valor: String(valor), respondidoEm: now, updatedAt: now },
        })
        .returning()
    )
  );

  recalculateScores(diagnosticoId).catch(() => {});

  res.json(
    saved.flat().map((r) => ({
      id: r.id,
      diagnosticoId: r.diagnosticoId,
      perguntaId: r.perguntaId,
      valor: r.valor,
      respondidoEm: r.respondidoEm.toISOString(),
    }))
  );
});

export default router;
