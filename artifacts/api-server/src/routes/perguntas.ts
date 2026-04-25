import { Router, type IRouter } from "express";
import { db, perguntasTable, respostasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { recalculateScores } from "../lib/score-calculator";

const router: IRouter = Router();

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

export default router;
