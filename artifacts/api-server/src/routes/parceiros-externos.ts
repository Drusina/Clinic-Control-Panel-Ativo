import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, parceirosExternosTable } from "@workspace/db";

const router: IRouter = Router();

function mapParceiro(p: typeof parceirosExternosTable.$inferSelect) {
  return {
    id: p.id,
    clinicId: p.clinicId,
    tipo: p.tipo,
    nomeEmpresa: p.nomeEmpresa ?? null,
    responsavel: p.responsavel ?? null,
    registroProfissional: p.registroProfissional ?? null,
    telefone: p.telefone ?? null,
    email: p.email ?? null,
    observacoes: p.observacoes ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/clinics/:clinicId/parceiros-externos", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const rows = await db
    .select()
    .from(parceirosExternosTable)
    .where(eq(parceirosExternosTable.clinicId, clinicId))
    .orderBy(parceirosExternosTable.tipo);

  res.json(rows.map(mapParceiro));
});

router.post("/clinics/:clinicId/parceiros-externos", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const d = req.body;

  if (!d.tipo) {
    res.status(400).json({ error: "tipo is required" });
    return;
  }

  const [parceiro] = await db
    .insert(parceirosExternosTable)
    .values({
      clinicId,
      tipo: d.tipo,
      nomeEmpresa: d.nomeEmpresa ?? null,
      responsavel: d.responsavel ?? null,
      registroProfissional: d.registroProfissional ?? null,
      telefone: d.telefone ?? null,
      email: d.email ?? null,
      observacoes: d.observacoes ?? null,
    })
    .returning();

  res.status(201).json(mapParceiro(parceiro));
});

router.patch("/clinics/:clinicId/parceiros-externos/:parceiroId", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const parceiroId = Array.isArray(req.params.parceiroId) ? req.params.parceiroId[0] : req.params.parceiroId;
  const d = req.body;

  const updates: Partial<typeof parceirosExternosTable.$inferInsert> = {};
  if (d.tipo !== undefined) updates.tipo = d.tipo;
  if (d.nomeEmpresa !== undefined) updates.nomeEmpresa = d.nomeEmpresa;
  if (d.responsavel !== undefined) updates.responsavel = d.responsavel;
  if (d.registroProfissional !== undefined) updates.registroProfissional = d.registroProfissional;
  if (d.telefone !== undefined) updates.telefone = d.telefone;
  if (d.email !== undefined) updates.email = d.email;
  if (d.observacoes !== undefined) updates.observacoes = d.observacoes;

  const [parceiro] = await db
    .update(parceirosExternosTable)
    .set(updates)
    .where(and(eq(parceirosExternosTable.id, parceiroId), eq(parceirosExternosTable.clinicId, clinicId)))
    .returning();

  if (!parceiro) {
    res.status(404).json({ error: "Parceiro not found" });
    return;
  }

  res.json(mapParceiro(parceiro));
});

router.delete("/clinics/:clinicId/parceiros-externos/:parceiroId", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const parceiroId = Array.isArray(req.params.parceiroId) ? req.params.parceiroId[0] : req.params.parceiroId;

  const [parceiro] = await db
    .delete(parceirosExternosTable)
    .where(and(eq(parceirosExternosTable.id, parceiroId), eq(parceirosExternosTable.clinicId, clinicId)))
    .returning();

  if (!parceiro) {
    res.status(404).json({ error: "Parceiro not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
