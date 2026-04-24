import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clinicActivityTable } from "@workspace/db";
import {
  CreateClinicActivityBody,
  GetClinicActivityResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/clinics/:clinicId/activity", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const activities = await db
    .select()
    .from(clinicActivityTable)
    .where(eq(clinicActivityTable.clinicId, clinicId))
    .orderBy(clinicActivityTable.createdAt);

  res.json(
    GetClinicActivityResponse.parse(
      activities.reverse().map((a) => ({
        id: a.id,
        clinicId: a.clinicId,
        tipo: a.tipo,
        titulo: a.titulo,
        descricao: a.descricao,
        autorNome: a.autorNome,
        createdAt: a.createdAt.toISOString(),
      }))
    )
  );
});

router.post("/clinics/:clinicId/activity", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const parsed = CreateClinicActivityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [activity] = await db
    .insert(clinicActivityTable)
    .values({
      clinicId,
      tipo: parsed.data.tipo,
      titulo: parsed.data.titulo,
      descricao: parsed.data.descricao ?? null,
    })
    .returning();

  res.status(201).json({
    id: activity.id,
    clinicId: activity.clinicId,
    tipo: activity.tipo,
    titulo: activity.titulo,
    descricao: activity.descricao,
    autorNome: activity.autorNome,
    createdAt: activity.createdAt.toISOString(),
  });
});

export default router;
