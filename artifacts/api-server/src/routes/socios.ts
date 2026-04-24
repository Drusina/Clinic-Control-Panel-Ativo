import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, sociosTable } from "@workspace/db";
import {
  CreateSocioBody,
  UpdateSocioBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function mapSocio(s: typeof sociosTable.$inferSelect) {
  return {
    id: s.id,
    clinicId: s.clinicId,
    nome: s.nome,
    qualificacao: s.qualificacao ?? null,
    qualId: s.qualId ?? null,
    dataEntrada: s.dataEntrada ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

router.get("/clinics/:clinicId/socios", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const rows = await db
    .select()
    .from(sociosTable)
    .where(eq(sociosTable.clinicId, clinicId))
    .orderBy(sociosTable.createdAt);

  res.json(rows.map(mapSocio));
});

router.post("/clinics/:clinicId/socios", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const parsed = CreateSocioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [socio] = await db
    .insert(sociosTable)
    .values({
      clinicId,
      nome: parsed.data.nome,
      qualificacao: parsed.data.qualificacao ?? null,
      qualId: parsed.data.qualId ?? null,
      dataEntrada: parsed.data.dataEntrada ?? null,
    })
    .returning();

  res.status(201).json(mapSocio(socio));
});

router.patch("/clinics/:clinicId/socios/:socioId", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const socioId = Array.isArray(req.params.socioId) ? req.params.socioId[0] : req.params.socioId;

  const parsed = UpdateSocioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof sociosTable.$inferInsert> = {};
  const d = parsed.data;
  if (d.nome != null) updates.nome = d.nome;
  if (d.qualificacao !== undefined) updates.qualificacao = d.qualificacao;
  if (d.qualId !== undefined) updates.qualId = d.qualId;
  if (d.dataEntrada !== undefined) updates.dataEntrada = d.dataEntrada;
  updates.updatedAt = new Date();

  const [socio] = await db
    .update(sociosTable)
    .set(updates)
    .where(and(eq(sociosTable.id, socioId), eq(sociosTable.clinicId, clinicId)))
    .returning();

  if (!socio) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }

  res.json(mapSocio(socio));
});

router.delete("/clinics/:clinicId/socios/:socioId", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const socioId = Array.isArray(req.params.socioId) ? req.params.socioId[0] : req.params.socioId;

  const [socio] = await db
    .delete(sociosTable)
    .where(and(eq(sociosTable.id, socioId), eq(sociosTable.clinicId, clinicId)))
    .returning();

  if (!socio) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
