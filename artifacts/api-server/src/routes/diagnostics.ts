import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, diagnosticsTable } from "@workspace/db";
import {
  ListDiagnosticsResponse,
  CompleteDiagnosticResponse,
} from "@workspace/api-zod";
import { recalculateScores } from "../lib/score-calculator";

const router: IRouter = Router();

function mapDiagnostic(d: typeof diagnosticsTable.$inferSelect) {
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
  };
}

router.get("/diagnostics/latest-active", async (req, res): Promise<void> => {
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

  const diagnostics = await db
    .select()
    .from(diagnosticsTable)
    .where(eq(diagnosticsTable.clinicId, clinicId))
    .orderBy(diagnosticsTable.createdAt);

  res.json(ListDiagnosticsResponse.parse(diagnostics.map(mapDiagnostic)));
});

router.post("/clinics/:clinicId/diagnostics", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

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

  res.json(mapDiagnostic(diagnostic));
});

router.post("/diagnostics/:id/calculate-scores", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const existing = await db.select().from(diagnosticsTable).where(eq(diagnosticsTable.id, id));
  if (!existing.length) {
    res.status(404).json({ error: "Diagnostic not found" });
    return;
  }

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

  res.json(CompleteDiagnosticResponse.parse(mapDiagnostic(diagnostic)));
});

export default router;
