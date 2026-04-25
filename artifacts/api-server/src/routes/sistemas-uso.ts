import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, sistemasUsoTable } from "@workspace/db";

const router: IRouter = Router();

function mapSistema(s: typeof sistemasUsoTable.$inferSelect) {
  return {
    id: s.id,
    clinicId: s.clinicId,
    nome: s.nome,
    fornecedor: s.fornecedor ?? null,
    tipo: s.tipo ?? null,
    apiDisponivel: s.apiDisponivel ?? null,
    responsavelInterno: s.responsavelInterno ?? null,
    criticidade: s.criticidade ?? null,
    integrado: s.integrado ?? false,
    createdAt: s.createdAt.toISOString(),
  };
}

router.get("/clinics/:clinicId/sistemas-uso", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const rows = await db
    .select()
    .from(sistemasUsoTable)
    .where(eq(sistemasUsoTable.clinicId, clinicId))
    .orderBy(sistemasUsoTable.createdAt);

  res.json(rows.map(mapSistema));
});

router.post("/clinics/:clinicId/sistemas-uso", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const d = req.body;

  if (!d.nome) {
    res.status(400).json({ error: "nome is required" });
    return;
  }

  const [sistema] = await db
    .insert(sistemasUsoTable)
    .values({
      clinicId,
      nome: d.nome,
      fornecedor: d.fornecedor ?? null,
      tipo: d.tipo ?? null,
      apiDisponivel: d.apiDisponivel ?? null,
      responsavelInterno: d.responsavelInterno ?? null,
      criticidade: d.criticidade ?? null,
      integrado: d.integrado ?? false,
    })
    .returning();

  res.status(201).json(mapSistema(sistema));
});

router.patch("/clinics/:clinicId/sistemas-uso/:sistemaId", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const sistemaId = Array.isArray(req.params.sistemaId) ? req.params.sistemaId[0] : req.params.sistemaId;
  const d = req.body;

  const updates: Partial<typeof sistemasUsoTable.$inferInsert> = {};
  if (d.nome !== undefined) updates.nome = d.nome;
  if (d.fornecedor !== undefined) updates.fornecedor = d.fornecedor;
  if (d.tipo !== undefined) updates.tipo = d.tipo;
  if (d.apiDisponivel !== undefined) updates.apiDisponivel = d.apiDisponivel;
  if (d.responsavelInterno !== undefined) updates.responsavelInterno = d.responsavelInterno;
  if (d.criticidade !== undefined) updates.criticidade = d.criticidade;
  if (d.integrado !== undefined) updates.integrado = d.integrado;

  const [sistema] = await db
    .update(sistemasUsoTable)
    .set(updates)
    .where(and(eq(sistemasUsoTable.id, sistemaId), eq(sistemasUsoTable.clinicId, clinicId)))
    .returning();

  if (!sistema) {
    res.status(404).json({ error: "Sistema not found" });
    return;
  }

  res.json(mapSistema(sistema));
});

router.delete("/clinics/:clinicId/sistemas-uso/:sistemaId", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const sistemaId = Array.isArray(req.params.sistemaId) ? req.params.sistemaId[0] : req.params.sistemaId;

  const [sistema] = await db
    .delete(sistemasUsoTable)
    .where(and(eq(sistemasUsoTable.id, sistemaId), eq(sistemasUsoTable.clinicId, clinicId)))
    .returning();

  if (!sistema) {
    res.status(404).json({ error: "Sistema not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
