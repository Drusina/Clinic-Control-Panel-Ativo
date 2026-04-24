import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, faturasTable } from "@workspace/db";
import { CreateFaturaBody, UpdateFaturaBody, UpdateFaturaResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function mapFatura(f: typeof faturasTable.$inferSelect) {
  return {
    id: f.id,
    clinicId: f.clinicId,
    numero: f.numero,
    vencimento: f.vencimento,
    valor: Number(f.valor),
    status: f.status,
    pagoEm: f.pagoEm,
    formaPagamento: f.formaPagamento,
    observacao: f.observacao,
    createdAt: f.createdAt.toISOString(),
  };
}

router.get("/clinics/:clinicId/faturas", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const faturas = await db
    .select()
    .from(faturasTable)
    .where(eq(faturasTable.clinicId, clinicId))
    .orderBy(faturasTable.vencimento);

  res.json(faturas.map(mapFatura));
});

router.post("/clinics/:clinicId/faturas", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const parsed = CreateFaturaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [fatura] = await db
    .insert(faturasTable)
    .values({
      clinicId,
      numero: parsed.data.numero,
      vencimento: parsed.data.vencimento,
      valor: parsed.data.valor.toString(),
      status: parsed.data.status ?? "pendente",
      formaPagamento: parsed.data.formaPagamento ?? null,
      observacao: parsed.data.observacao ?? null,
    })
    .returning();

  res.status(201).json(mapFatura(fatura));
});

router.patch("/faturas/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateFaturaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof faturasTable.$inferInsert> = {};
  const d = parsed.data;
  if (d.status != null) updates.status = d.status;
  if (d.pagoEm !== undefined) updates.pagoEm = d.pagoEm;
  if (d.formaPagamento !== undefined) updates.formaPagamento = d.formaPagamento;
  if (d.observacao !== undefined) updates.observacao = d.observacao;

  const [fatura] = await db.update(faturasTable).set(updates).where(eq(faturasTable.id, id)).returning();
  if (!fatura) {
    res.status(404).json({ error: "Fatura not found" });
    return;
  }

  res.json(UpdateFaturaResponse.parse(mapFatura(fatura)));
});

export default router;
