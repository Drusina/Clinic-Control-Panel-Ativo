import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, risksTable } from "@workspace/db";
import { CreateRiskBody, UpdateRiskBody, UpdateRiskResponse } from "@workspace/api-zod";
import { ICS_RISKS } from "../lib/ics-seed.js";

const router: IRouter = Router();

function mapRisk(r: typeof risksTable.$inferSelect) {
  return {
    id: r.id,
    clinicId: r.clinicId,
    nome: r.nome,
    descricao: r.descricao,
    probabilidade: r.probabilidade,
    impacto: r.impacto,
    severidade: r.severidade,
    pilarSlug: r.pilarSlug,
    responsavel: r.responsavel,
    acoesMitigadoras: r.acoesMitigadoras,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/clinics/:clinicId/risks", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const risks = await db
    .select()
    .from(risksTable)
    .where(eq(risksTable.clinicId, clinicId))
    .orderBy(risksTable.createdAt);

  res.json(risks.map(mapRisk));
});

router.post("/clinics/:clinicId/risks", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const parsed = CreateRiskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { nome, descricao, probabilidade, impacto, pilarSlug, responsavel, acoesMitigadoras } = parsed.data;
  const severidade = probabilidade * impacto;

  const [risk] = await db
    .insert(risksTable)
    .values({
      clinicId,
      nome,
      descricao: descricao ?? null,
      probabilidade,
      impacto,
      severidade,
      pilarSlug: pilarSlug ?? null,
      responsavel: responsavel ?? null,
      acoesMitigadoras: acoesMitigadoras ?? null,
    })
    .returning();

  res.status(201).json(mapRisk(risk));
});

router.patch("/risks/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateRiskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(risksTable).where(eq(risksTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Risk not found" });
    return;
  }

  const d = parsed.data;
  const probabilidade = d.probabilidade ?? existing.probabilidade;
  const impacto = d.impacto ?? existing.impacto;

  const updates: Partial<typeof risksTable.$inferInsert> = {
    probabilidade,
    impacto,
    severidade: probabilidade * impacto,
  };
  if (d.nome != null) updates.nome = d.nome;
  if (d.descricao !== undefined) updates.descricao = d.descricao;
  if (d.pilarSlug !== undefined) updates.pilarSlug = d.pilarSlug;
  if (d.responsavel !== undefined) updates.responsavel = d.responsavel;
  if (d.acoesMitigadoras !== undefined) updates.acoesMitigadoras = d.acoesMitigadoras;
  if (d.status != null) updates.status = d.status;

  const [risk] = await db.update(risksTable).set(updates).where(eq(risksTable.id, id)).returning();

  res.json(UpdateRiskResponse.parse(mapRisk(risk)));
});


router.post("/clinics/:clinicId/risks/seed", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const existing = await db
    .select({ nome: risksTable.nome })
    .from(risksTable)
    .where(eq(risksTable.clinicId, clinicId));

  const existingNames = new Set(existing.map(r => r.nome));
  const toCreate = ICS_RISKS.filter(r => !existingNames.has(r.nome));

  if (toCreate.length === 0) {
    res.json({ created: 0, message: "Todos os riscos ICS já foram inseridos." });
    return;
  }

  const created = await db
    .insert(risksTable)
    .values(
      toCreate.map(r => ({
        clinicId,
        nome: r.nome,
        descricao: r.descricao,
        probabilidade: r.probabilidade,
        impacto: r.impacto,
        severidade: r.probabilidade * r.impacto,
        pilarSlug: r.pilarSlug,
        responsavel: null,
        acoesMitigadoras: r.acoesMitigadoras,
        status: "identificado" as const,
      }))
    )
    .returning();

  res.status(201).json({ created: created.length, risks: created.map(mapRisk) });
});

router.delete("/risks/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [risk] = await db.delete(risksTable).where(eq(risksTable.id, id)).returning();
  if (!risk) {
    res.status(404).json({ error: "Risk not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
