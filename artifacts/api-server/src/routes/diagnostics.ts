import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, diagnosticsTable } from "@workspace/db";
import {
  ListDiagnosticsResponse,
  CompleteDiagnosticResponse,
} from "@workspace/api-zod";
import {
  recalculateScores,
  computeProgressForDiagnostics,
  type DiagnosticProgress,
} from "../lib/score-calculator";
import { assertClinicAccess, type AuthenticatedRequest as AuthRequest } from "../middleware/auth";

const router: IRouter = Router();

function mapDiagnostic(
  d: typeof diagnosticsTable.$inferSelect,
  progress?: DiagnosticProgress,
) {
  return {
    id: d.id,
    clinicId: d.clinicId,
    versao: d.versao ?? 1,
    status: d.status,
    iniciadoEm: d.iniciadoEm.toISOString(),
    concluidoEm: d.concluidoEm?.toISOString() ?? null,
    scoreGlobal: d.scoreGlobal != null ? Number(d.scoreGlobal) : null,
    scoresPilares: d.scoresPilares as Record<string, number> | null,
    metasPilares: d.metasPilares as Record<string, number> | null,
    insightsIa: d.insightsIa as Record<string, unknown> | null,
    createdAt: d.createdAt.toISOString(),
    ...(progress ? { progresso: progress } : {}),
  };
}

router.get("/diagnostics/latest-active", async (req, res): Promise<void> => {
  // Global super-admin overview only — used by the legacy super-admin
  // dashboard. Team members do not need this; they reach diagnostics
  // through `/clinics/:clinicId/diagnostics`.
  const user = (req as AuthRequest).user;
  if (!user || user.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [diagnostic] = await db
    .select()
    .from(diagnosticsTable)
    .where(eq(diagnosticsTable.status, "em_andamento"))
    .orderBy(desc(diagnosticsTable.createdAt))
    .limit(1);

  if (!diagnostic) {
    res.json(null);
    return;
  }

  res.json(mapDiagnostic(diagnostic));
});

router.get("/clinics/:clinicId/diagnostics", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  if (await assertClinicAccess(req, res, clinicId)) return;

  const diagnostics = await db
    .select()
    .from(diagnosticsTable)
    .where(eq(diagnosticsTable.clinicId, clinicId))
    .orderBy(diagnosticsTable.createdAt);

  const progressMap = await computeProgressForDiagnostics(diagnostics.map((d) => d.id));

  res.json(
    ListDiagnosticsResponse.parse(
      diagnostics.map((d) => mapDiagnostic(d, progressMap.get(d.id))),
    ),
  );
});

router.post("/clinics/:clinicId/diagnostics", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  if (await assertClinicAccess(req, res, clinicId)) return;

  // The "at most one em_andamento per clinic" check and the version allocation
  // both read existing rows and then write, so two concurrent creates (e.g. a
  // double-click) could each see no in-progress diagnostic and both insert.
  // A per-clinic transaction advisory lock serializes creates for the same
  // clinic, keeping the invariant and the max(versao)+1 numbering race-safe.
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`create-diagnostic:${clinicId}`}))`,
    );

    const existing = await tx
      .select()
      .from(diagnosticsTable)
      .where(eq(diagnosticsTable.clinicId, clinicId));

    if (existing.some((d) => d.status === "em_andamento")) {
      return { conflict: true as const };
    }

    // Next version comes from the highest existing version (not the count) so
    // deletions never produce duplicate version numbers.
    const nextVersion =
      existing.reduce((max, d) => Math.max(max, d.versao ?? 0), 0) + 1;

    const [created] = await tx
      .insert(diagnosticsTable)
      .values({ clinicId, versao: nextVersion })
      .returning();

    return { conflict: false as const, created };
  });

  // Only one diagnostic can be "em andamento" at a time. Enforced server-side
  // so the rule holds regardless of which frontend triggered the create.
  if (outcome.conflict) {
    res.status(409).json({
      error:
        "Já existe um diagnóstico em andamento para esta clínica. Conclua (responda 100%) ou exclua o diagnóstico atual antes de iniciar um novo.",
    });
    return;
  }

  res.status(201).json(mapDiagnostic(outcome.created));
});

router.get("/diagnostics/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [diagnostic] = await db
    .select()
    .from(diagnosticsTable)
    .where(eq(diagnosticsTable.id, id));

  if (!diagnostic) {
    res.status(404).json({ error: "Diagnostic not found" });
    return;
  }
  if (await assertClinicAccess(req, res, diagnostic.clinicId)) return;

  res.json(mapDiagnostic(diagnostic));
});

router.post("/diagnostics/:id/calculate-scores", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const existing = await db.select().from(diagnosticsTable).where(eq(diagnosticsTable.id, id));
  if (!existing.length) {
    res.status(404).json({ error: "Diagnostic not found" });
    return;
  }
  if (await assertClinicAccess(req, res, existing[0].clinicId)) return;

  await recalculateScores(id);

  const [diagnostic] = await db.select().from(diagnosticsTable).where(eq(diagnosticsTable.id, id));
  res.json(mapDiagnostic(diagnostic));
});

router.post("/diagnostics/:id/complete", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const existing = await db.select().from(diagnosticsTable).where(eq(diagnosticsTable.id, id));
  if (!existing.length) {
    res.status(404).json({ error: "Diagnostic not found" });
    return;
  }
  if (await assertClinicAccess(req, res, existing[0].clinicId)) return;

  // Gate: a diagnostic can only be concluded once every question in the bank
  // (all 8 pilares) has a response. Reject otherwise so the conclusion always
  // reflects a fully answered diagnostic, independent of any frontend guard.
  const progress = (await computeProgressForDiagnostics([id])).get(id);
  if (!progress || !progress.completo) {
    res.status(422).json({
      error: progress
        ? `O diagnóstico ainda não foi totalmente respondido (${progress.totalAnswered} de ${progress.totalQuestions} perguntas). Responda todas as perguntas dos pilares antes de concluir.`
        : "Não foi possível verificar o progresso do diagnóstico.",
    });
    return;
  }

  await recalculateScores(id);

  const [diagnostic] = await db
    .update(diagnosticsTable)
    .set({ status: "concluido", concluidoEm: new Date() })
    .where(eq(diagnosticsTable.id, id))
    .returning();

  if (!diagnostic) {
    res.status(404).json({ error: "Diagnostic not found" });
    return;
  }

  res.json(CompleteDiagnosticResponse.parse(mapDiagnostic(diagnostic, progress)));
});

router.post("/diagnostics/:id/reopen", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const existing = await db.select().from(diagnosticsTable).where(eq(diagnosticsTable.id, id));
  if (!existing.length) {
    res.status(404).json({ error: "Diagnostic not found" });
    return;
  }
  if (await assertClinicAccess(req, res, existing[0].clinicId)) return;

  const [diagnostic] = await db
    .update(diagnosticsTable)
    .set({ status: "em_andamento", concluidoEm: null })
    .where(eq(diagnosticsTable.id, id))
    .returning();

  if (!diagnostic) {
    res.status(404).json({ error: "Diagnostic not found" });
    return;
  }

  res.json(CompleteDiagnosticResponse.parse(mapDiagnostic(diagnostic)));
});

router.delete("/diagnostics/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const existing = await db.select().from(diagnosticsTable).where(eq(diagnosticsTable.id, id));
  if (!existing.length) {
    res.status(404).json({ error: "Diagnostic not found" });
    return;
  }
  if (await assertClinicAccess(req, res, existing[0].clinicId)) return;

  // Only in-progress diagnostics can be deleted. Concluded diagnostics are
  // preserved because their scores feed the risk map and action plan; removing
  // one requires reopening it first (out of scope here).
  if (existing[0].status !== "em_andamento") {
    res.status(409).json({
      error:
        "Apenas diagnósticos em andamento podem ser excluídos. Diagnósticos concluídos preservam o histórico, riscos e plano de ação vinculados.",
    });
    return;
  }

  // The diagnostic's answers (respostas) are removed automatically via the
  // ON DELETE CASCADE foreign key on respostas.diagnostico_id. The delete is
  // re-scoped to status='em_andamento' so a concurrent "concluir" between the
  // check above and this write can never delete a now-concluded diagnostic.
  const deleted = await db
    .delete(diagnosticsTable)
    .where(
      and(
        eq(diagnosticsTable.id, id),
        eq(diagnosticsTable.status, "em_andamento"),
      ),
    )
    .returning({ id: diagnosticsTable.id });

  if (!deleted.length) {
    res.status(409).json({
      error:
        "O diagnóstico deixou de estar em andamento e não pode mais ser excluído.",
    });
    return;
  }

  res.status(204).end();
});

export default router;
