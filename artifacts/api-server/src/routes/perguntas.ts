import { Router, type IRouter } from "express";
import { db, perguntasTable, respostasTable, diagnosticsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { z } from "zod";
import { recalculateScores } from "../lib/score-calculator";
import { assertClinicAccess, type AuthenticatedRequest } from "../middleware/auth";
import { PERGUNTAS_SEED } from "../lib/perguntas-seed.js";

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

/**
 * Pergunta CRUD/import are super_admin-only — the question bank is global to
 * all clinics and editing it changes future scoring. The router itself is
 * mounted under `requireAuth`, so we guard inline per-handler.
 */
function ensureSuperAdmin(req: Parameters<typeof assertClinicAccess>[0], res: Parameters<typeof assertClinicAccess>[1]): boolean {
  const user = (req as AuthenticatedRequest).user;
  if (!user || user.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden: super_admin role required" });
    return true;
  }
  return false;
}

const PerguntaTipoEnum = z.enum(["sim_nao", "escala_1_5", "numerico", "texto_livre"]);

const InsertPerguntaBody = z.object({
  pilarSlug: z.string().min(1),
  pilarNome: z.string().min(1),
  pilarOrdem: z.number().int().min(1),
  texto: z.string().min(1),
  tipo: PerguntaTipoEnum,
  peso: z.number().positive().optional().default(1),
  ordem: z.number().int().min(1),
  dica: z.string().optional().nullable(),
  valorMin: z.number().optional().nullable(),
  valorMax: z.number().optional().nullable(),
  inverso: z.boolean().optional().default(false),
});

const UpdatePerguntaBody = InsertPerguntaBody.partial();

const ImportPerguntasBody = z.object({
  items: z.array(InsertPerguntaBody).min(1),
  upsert: z.boolean().optional().default(true),
});

function mapPergunta(p: typeof perguntasTable.$inferSelect) {
  return {
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
  };
}

const router: IRouter = Router();

// ─── Read endpoints (any authenticated user) ────────────────────────────────

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

  res.json(perguntas.map(mapPergunta));
});

router.get("/perguntas", async (_req, res): Promise<void> => {
  const perguntas = await db
    .select()
    .from(perguntasTable)
    .orderBy(perguntasTable.pilarOrdem, perguntasTable.ordem);

  res.json(perguntas.map(mapPergunta));
});

// ─── CRUD (super_admin only — global question bank) ─────────────────────────

router.post("/perguntas", async (req, res): Promise<void> => {
  if (ensureSuperAdmin(req, res)) return;

  const parsed = InsertPerguntaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const d = parsed.data;

  const [created] = await db
    .insert(perguntasTable)
    .values({
      pilarSlug: d.pilarSlug,
      pilarNome: d.pilarNome,
      pilarOrdem: d.pilarOrdem,
      texto: d.texto,
      tipo: d.tipo,
      peso: d.peso.toFixed(2),
      ordem: d.ordem,
      dica: d.dica ?? null,
      valorMin: d.valorMin != null ? d.valorMin.toFixed(2) : null,
      valorMax: d.valorMax != null ? d.valorMax.toFixed(2) : null,
      inverso: d.inverso,
    })
    .returning();

  res.status(201).json(mapPergunta(created));
});

router.patch("/perguntas/:id", async (req, res): Promise<void> => {
  if (ensureSuperAdmin(req, res)) return;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const parsed = UpdatePerguntaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const d = parsed.data;

  const updates: Partial<typeof perguntasTable.$inferInsert> = {};
  if (d.pilarSlug !== undefined) updates.pilarSlug = d.pilarSlug;
  if (d.pilarNome !== undefined) updates.pilarNome = d.pilarNome;
  if (d.pilarOrdem !== undefined) updates.pilarOrdem = d.pilarOrdem;
  if (d.texto !== undefined) updates.texto = d.texto;
  if (d.tipo !== undefined) updates.tipo = d.tipo;
  if (d.peso !== undefined) updates.peso = d.peso.toFixed(2);
  if (d.ordem !== undefined) updates.ordem = d.ordem;
  if (d.dica !== undefined) updates.dica = d.dica;
  if (d.valorMin !== undefined) updates.valorMin = d.valorMin != null ? d.valorMin.toFixed(2) : null;
  if (d.valorMax !== undefined) updates.valorMax = d.valorMax != null ? d.valorMax.toFixed(2) : null;
  if (d.inverso !== undefined) updates.inverso = d.inverso;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(perguntasTable)
    .set(updates)
    .where(eq(perguntasTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Pergunta not found" });
    return;
  }

  res.json(mapPergunta(updated));
});

router.delete("/perguntas/:id", async (req, res): Promise<void> => {
  if (ensureSuperAdmin(req, res)) return;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const force = req.query.force === "true" || req.query.force === "1";

  // Refuse delete if there are answers — unless explicitly forced.
  const [{ value: respCount }] = await db
    .select({ value: count() })
    .from(respostasTable)
    .where(eq(respostasTable.perguntaId, id));

  if (respCount > 0 && !force) {
    res.status(409).json({
      error: "Pergunta possui respostas associadas",
      respostasCount: respCount,
      hint: "Use ?force=true para apagar mesmo assim (as respostas serão removidas em cascata).",
    });
    return;
  }

  await db.delete(perguntasTable).where(eq(perguntasTable.id, id));
  res.sendStatus(204);
});

router.post("/perguntas/import", async (req, res): Promise<void> => {
  if (ensureSuperAdmin(req, res)) return;

  const parsed = ImportPerguntasBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const { items, upsert } = parsed.data;

  let inserted = 0;
  let updated = 0;

  for (const d of items) {
    const existing = upsert
      ? await db
          .select({ id: perguntasTable.id })
          .from(perguntasTable)
          .where(and(eq(perguntasTable.pilarSlug, d.pilarSlug), eq(perguntasTable.ordem, d.ordem)))
          .limit(1)
      : [];

    if (existing.length > 0) {
      await db
        .update(perguntasTable)
        .set({
          pilarNome: d.pilarNome,
          pilarOrdem: d.pilarOrdem,
          texto: d.texto,
          tipo: d.tipo,
          peso: d.peso.toFixed(2),
          dica: d.dica ?? null,
          valorMin: d.valorMin != null ? d.valorMin.toFixed(2) : null,
          valorMax: d.valorMax != null ? d.valorMax.toFixed(2) : null,
          inverso: d.inverso,
        })
        .where(eq(perguntasTable.id, existing[0].id));
      updated++;
    } else {
      await db.insert(perguntasTable).values({
        pilarSlug: d.pilarSlug,
        pilarNome: d.pilarNome,
        pilarOrdem: d.pilarOrdem,
        texto: d.texto,
        tipo: d.tipo,
        peso: d.peso.toFixed(2),
        ordem: d.ordem,
        dica: d.dica ?? null,
        valorMin: d.valorMin != null ? d.valorMin.toFixed(2) : null,
        valorMax: d.valorMax != null ? d.valorMax.toFixed(2) : null,
        inverso: d.inverso,
      });
      inserted++;
    }
  }

  res.json({ inserted, updated, total: items.length });
});

router.post("/perguntas/reset-to-seed", async (req, res): Promise<void> => {
  if (ensureSuperAdmin(req, res)) return;

  // Re-apply the canonical seed: insert any missing (pilar, ordem) pairs and
  // refresh pilar metadata. Existing question text/tipo/peso edits are kept.
  const existingRows = await db.select().from(perguntasTable);
  const existingKey = new Set(existingRows.map((r) => `${r.pilarSlug}::${r.ordem}`));

  type InsertRow = typeof perguntasTable.$inferInsert;
  const toInsert: InsertRow[] = [];

  for (const pilar of PERGUNTAS_SEED) {
    pilar.perguntas.forEach((p, idx) => {
      const ordem = idx + 1;
      if (existingKey.has(`${pilar.slug}::${ordem}`)) return;
      toInsert.push({
        pilarSlug: pilar.slug,
        pilarNome: pilar.nome,
        pilarOrdem: pilar.ordem,
        texto: p.texto,
        tipo: p.tipo,
        peso: (p.peso ?? 1).toFixed(2),
        ordem,
        dica: p.dica ?? null,
        valorMin: p.valorMin != null ? p.valorMin.toFixed(2) : null,
        valorMax: p.valorMax != null ? p.valorMax.toFixed(2) : null,
        inverso: p.inverso ?? false,
      });
    });
  }

  if (toInsert.length > 0) {
    await db.insert(perguntasTable).values(toInsert);
  }

  res.json({ inserted: toInsert.length });
});

// ─── Respostas (clinic-scoped via diagnostic) ───────────────────────────────

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

// ─── Hydrated diagnostic (everything the Delegação page needs in 1 call) ─

router.get("/clinics/:clinicId/diagnostics/:diagnosticoId/hydrated", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const diagnosticoId = Array.isArray(req.params.diagnosticoId)
    ? req.params.diagnosticoId[0]
    : req.params.diagnosticoId;

  if (await assertClinicAccess(req, res, clinicId)) return;

  const [diagnostic] = await db
    .select()
    .from(diagnosticsTable)
    .where(and(eq(diagnosticsTable.id, diagnosticoId), eq(diagnosticsTable.clinicId, clinicId)));

  if (!diagnostic) {
    res.status(404).json({ error: "Diagnostic not found for this clinic" });
    return;
  }

  const [perguntas, respostas] = await Promise.all([
    db
      .select()
      .from(perguntasTable)
      .orderBy(perguntasTable.pilarOrdem, perguntasTable.ordem),
    db
      .select()
      .from(respostasTable)
      .where(eq(respostasTable.diagnosticoId, diagnosticoId)),
  ]);

  // Build pillar summary (questionCount, answeredCount per pilar)
  const respondedIds = new Set(respostas.map((r) => r.perguntaId));
  const pillarMap = new Map<string, { slug: string; nome: string; ordem: number; questionCount: number; answeredCount: number }>();
  for (const p of perguntas) {
    let row = pillarMap.get(p.pilarSlug);
    if (!row) {
      row = { slug: p.pilarSlug, nome: p.pilarNome, ordem: p.pilarOrdem, questionCount: 0, answeredCount: 0 };
      pillarMap.set(p.pilarSlug, row);
    }
    row.questionCount++;
    if (respondedIds.has(p.id)) row.answeredCount++;
  }
  const pillars = Array.from(pillarMap.values()).sort((a, b) => a.ordem - b.ordem);

  res.json({
    diagnostic: {
      id: diagnostic.id,
      clinicId: diagnostic.clinicId,
      versao: diagnostic.versao ?? 1,
      status: diagnostic.status,
      iniciadoEm: diagnostic.iniciadoEm.toISOString(),
      concluidoEm: diagnostic.concluidoEm?.toISOString() ?? null,
      scoreGlobal: diagnostic.scoreGlobal != null ? Number(diagnostic.scoreGlobal) : null,
      scoresPilares: diagnostic.scoresPilares as Record<string, number> | null,
      metasPilares: diagnostic.metasPilares as Record<string, number> | null,
      insightsIa: diagnostic.insightsIa as Record<string, unknown> | null,
    },
    pillars,
    questions: perguntas.map(mapPergunta),
    respostas: respostas.map((r) => ({
      id: r.id,
      perguntaId: r.perguntaId,
      valor: r.valor,
      respondidoEm: r.respondidoEm.toISOString(),
    })),
  });
});

export default router;
