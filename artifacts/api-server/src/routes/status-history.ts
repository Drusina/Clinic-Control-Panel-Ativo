import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, clinicStatusHistoryTable } from "@workspace/db";
import {
  GetClinicStatusHistoryParams,
  GetClinicStatusHistoryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function mapStatusHistory(r: typeof clinicStatusHistoryTable.$inferSelect) {
  return {
    id: r.id,
    clinicId: r.clinicId,
    status: r.status,
    motivo: r.motivo ?? null,
    autorNome: r.autorNome ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/clinics/:id/status-history", async (req, res): Promise<void> => {
  const params = GetClinicStatusHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const id = params.data.id;

  const rows = await db
    .select()
    .from(clinicStatusHistoryTable)
    .where(eq(clinicStatusHistoryTable.clinicId, id))
    .orderBy(desc(clinicStatusHistoryTable.createdAt));

  res.json(GetClinicStatusHistoryResponse.parse(rows.map(mapStatusHistory)));
});

export default router;
