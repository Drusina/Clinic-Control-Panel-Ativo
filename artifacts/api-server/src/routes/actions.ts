import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, actionsTable, clinicsTable } from "@workspace/db";
import { assertClinicAccess } from "../middleware/auth";
import {
  CreateActionBody,
  UpdateActionBody,
  ListActionsQueryParams,
  UpdateActionResponse,
} from "@workspace/api-zod";
import { getTemplateForPlan } from "../lib/ics-seed.js";

const router: IRouter = Router();

function mapAction(a: typeof actionsTable.$inferSelect) {
  return {
    id: a.id,
    clinicId: a.clinicId,
    titulo: a.titulo,
    descricao: a.descricao,
    responsavelNome: a.responsavelNome,
    prazo: a.prazo,
    prioridade: a.prioridade,
    pilarSlug: a.pilarSlug,
    evidencias: a.evidencias,
    coluna: a.coluna,
    ordem: a.ordem,
    concluidoEm: a.concluidoEm?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

router.get("/clinics/:clinicId/actions", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const qp = ListActionsQueryParams.safeParse(req.query);
  if (!qp.success) {
    res.status(400).json({ error: qp.error.message });
    return;
  }

  const conditions = [eq(actionsTable.clinicId, clinicId)];
  if (qp.data.coluna) conditions.push(eq(actionsTable.coluna, qp.data.coluna));

  const actions = await db
    .select()
    .from(actionsTable)
    .where(and(...conditions))
    .orderBy(actionsTable.ordem);

  res.json(actions.map(mapAction));
});

router.post("/clinics/:clinicId/actions", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const parsed = CreateActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [action] = await db
    .insert(actionsTable)
    .values({
      clinicId,
      titulo: parsed.data.titulo,
      descricao: parsed.data.descricao ?? null,
      responsavelNome: parsed.data.responsavelNome ?? null,
      prazo: parsed.data.prazo ?? null,
      prioridade: parsed.data.prioridade ?? null,
      pilarSlug: parsed.data.pilarSlug ?? null,
      evidencias: parsed.data.evidencias ?? null,
      coluna: parsed.data.coluna ?? "backlog",
    })
    .returning();

  res.status(201).json(mapAction(action));
});

router.patch("/actions/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existingAction] = await db
    .select({ clinicId: actionsTable.clinicId })
    .from(actionsTable)
    .where(eq(actionsTable.id, id))
    .limit(1);
  if (!existingAction) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (await assertClinicAccess(req, res, existingAction.clinicId)) return;

  const updates: Partial<typeof actionsTable.$inferInsert> = {};
  const d = parsed.data;
  if (d.titulo != null) updates.titulo = d.titulo;
  if (d.descricao !== undefined) updates.descricao = d.descricao;
  if (d.responsavelNome !== undefined) updates.responsavelNome = d.responsavelNome;
  if (d.prazo !== undefined) updates.prazo = d.prazo;
  if (d.prioridade !== undefined) updates.prioridade = d.prioridade;
  if (d.pilarSlug !== undefined) updates.pilarSlug = d.pilarSlug;
  if (d.evidencias !== undefined) updates.evidencias = d.evidencias;
  if (d.coluna != null) {
    updates.coluna = d.coluna;
    if (d.coluna === "done") updates.concluidoEm = new Date();
  }
  if (d.ordem != null) updates.ordem = d.ordem;
  updates.updatedAt = new Date();

  const [action] = await db
    .update(actionsTable)
    .set(updates)
    .where(eq(actionsTable.id, id))
    .returning();

  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }

  res.json(UpdateActionResponse.parse(mapAction(action)));
});


router.post("/clinics/:clinicId/actions/seed", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const [clinic] = await db.select({ plano: clinicsTable.plano }).from(clinicsTable).where(eq(clinicsTable.id, clinicId));
  const template = await getTemplateForPlan(clinic?.plano);

  const existing = await db
    .select({ titulo: actionsTable.titulo })
    .from(actionsTable)
    .where(eq(actionsTable.clinicId, clinicId));

  const existingTitles = new Set(existing.map(a => a.titulo));
  const toCreate = template.actions.filter(a => !existingTitles.has(a.titulo));

  if (toCreate.length === 0) {
    res.json({ created: 0, message: "Todas as ações ICS já foram inseridas." });
    return;
  }

  const now = new Date();
  const created = await db
    .insert(actionsTable)
    .values(
      toCreate.map(a => ({
        clinicId,
        titulo: a.titulo,
        descricao: a.descricao,
        pilarSlug: a.pilarSlug,
        prioridade: a.prioridade,
        coluna: a.coluna,
        ordem: a.ordem,
        responsavelNome: null,
        prazo: null,
        evidencias: null,
        concluidoEm: a.coluna === "done" ? now : null,
      }))
    )
    .returning();

  res.status(201).json({ created: created.length, actions: created.map(mapAction) });
});

router.delete("/actions/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [existingAction] = await db
    .select({ clinicId: actionsTable.clinicId })
    .from(actionsTable)
    .where(eq(actionsTable.id, id))
    .limit(1);
  if (!existingAction) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (await assertClinicAccess(req, res, existingAction.clinicId)) return;

  await db.delete(actionsTable).where(eq(actionsTable.id, id));
  res.sendStatus(204);
});

export default router;
