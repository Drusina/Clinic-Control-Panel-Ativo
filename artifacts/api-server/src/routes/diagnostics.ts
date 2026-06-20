import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
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

  const existing = await db
    .select()
    .from(diagnosticsTable)
    .where(eq(diagnosticsTable.clinicId, clinicId));

  const nextVersion = existing.length + 1;

  const [diagnostic] = await db
    .insert(diagnosticsTable)
    .values({ clinicId, versao: nextVersion })
    .returning();

  res.status(201).json(mapDiagnostic(diagnostic));
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

export default router;
