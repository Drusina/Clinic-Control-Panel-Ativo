import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, sociosTable } from "@workspace/db";

const router: IRouter = Router();

function mapSocio(s: typeof sociosTable.$inferSelect) {
  return {
    id: s.id,
    clinicId: s.clinicId,
    nome: s.nome,
    cpf: s.cpf ?? null,
    percentual: s.percentual != null ? Number(s.percentual) : null,
    cargo: s.cargo ?? null,
    decisor: s.decisor ?? false,
    email: s.email ?? null,
    whatsapp: s.whatsapp ?? null,
    origem: s.origem ?? "manual",
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
  const d = req.body;

  if (!d.nome) {
    res.status(400).json({ error: "nome is required" });
    return;
  }

  const [socio] = await db
    .insert(sociosTable)
    .values({
      clinicId,
      nome: d.nome,
      cpf: d.cpf ?? null,
      percentual: d.percentual != null ? String(d.percentual) : null,
      cargo: d.cargo ?? null,
      decisor: d.decisor ?? false,
      email: d.email ?? null,
      whatsapp: d.whatsapp ?? null,
      origem: d.origem ?? "manual",
      qualificacao: d.qualificacao ?? null,
      qualId: d.qualId ?? null,
      dataEntrada: d.dataEntrada ?? null,
    })
    .returning();

  res.status(201).json(mapSocio(socio));
});

router.patch("/clinics/:clinicId/socios/:socioId", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const socioId = Array.isArray(req.params.socioId) ? req.params.socioId[0] : req.params.socioId;
  const d = req.body;

  const updates: Partial<typeof sociosTable.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
  if (d.nome != null) updates.nome = d.nome;
  if (d.cpf !== undefined) updates.cpf = d.cpf;
  if (d.percentual !== undefined) updates.percentual = d.percentual != null ? String(d.percentual) : null;
  if (d.cargo !== undefined) updates.cargo = d.cargo;
  if (d.decisor !== undefined) updates.decisor = d.decisor;
  if (d.email !== undefined) updates.email = d.email;
  if (d.whatsapp !== undefined) updates.whatsapp = d.whatsapp;
  if (d.origem !== undefined) updates.origem = d.origem;
  if (d.qualificacao !== undefined) updates.qualificacao = d.qualificacao;
  if (d.qualId !== undefined) updates.qualId = d.qualId;
  if (d.dataEntrada !== undefined) updates.dataEntrada = d.dataEntrada;

  const [socio] = await db
    .update(sociosTable)
    .set(updates)
    .where(and(eq(sociosTable.id, socioId), eq(sociosTable.clinicId, clinicId)))
    .returning();

  if (!socio) {
    res.status(404).json({ error: "Sócio not found" });
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
    res.status(404).json({ error: "Sócio not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
