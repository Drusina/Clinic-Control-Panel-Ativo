import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, kickoffsTable } from "@workspace/db";
import { UpsertKickoffBody, GetKickoffResponse, UpsertKickoffResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function mapKickoff(k: typeof kickoffsTable.$inferSelect) {
  return {
    id: k.id,
    clinicId: k.clinicId,
    dataRealizacao: k.dataRealizacao,
    modalidade: k.modalidade,
    duracaoMinutos: k.duracaoMinutos,
    facilitador: k.facilitador,
    status: k.status,
    createdAt: k.createdAt.toISOString(),
    updatedAt: k.updatedAt.toISOString(),
  };
}

router.get("/clinics/:clinicId/kickoff", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const [kickoff] = await db.select().from(kickoffsTable).where(eq(kickoffsTable.clinicId, clinicId));
  if (!kickoff) {
    res.status(404).json({ error: "Kickoff not found" });
    return;
  }

  res.json(GetKickoffResponse.parse(mapKickoff(kickoff)));
});

router.put("/clinics/:clinicId/kickoff", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const parsed = UpsertKickoffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db.select().from(kickoffsTable).where(eq(kickoffsTable.clinicId, clinicId));
  const d = parsed.data;

  if (existing.length > 0) {
    const [kickoff] = await db
      .update(kickoffsTable)
      .set({
        dataRealizacao: d.dataRealizacao ?? null,
        modalidade: d.modalidade ?? null,
        duracaoMinutos: d.duracaoMinutos ?? null,
        facilitador: d.facilitador ?? null,
        status: d.status ?? existing[0].status,
        updatedAt: new Date(),
      })
      .where(eq(kickoffsTable.clinicId, clinicId))
      .returning();

    res.json(UpsertKickoffResponse.parse(mapKickoff(kickoff)));
  } else {
    const [kickoff] = await db
      .insert(kickoffsTable)
      .values({
        clinicId,
        dataRealizacao: d.dataRealizacao ?? null,
        modalidade: d.modalidade ?? null,
        duracaoMinutos: d.duracaoMinutos ?? null,
        facilitador: d.facilitador ?? null,
        status: d.status ?? "rascunho",
      })
      .returning();

    res.json(UpsertKickoffResponse.parse(mapKickoff(kickoff)));
  }
});

export default router;
