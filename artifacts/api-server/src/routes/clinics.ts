import { Router, type IRouter } from "express";
import { eq, ilike, and, count, sql } from "drizzle-orm";
import { db, clinicsTable, clinicActivityTable } from "@workspace/db";
import {
  CreateClinicBody,
  UpdateClinicBody,
  UpdateClinicStatusBody,
  ListClinicsQueryParams,
  GetClinicResponse,
  ListClinicsResponse,
  UpdateClinicResponse,
  UpdateClinicStatusResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function mapClinic(c: typeof clinicsTable.$inferSelect) {
  return {
    id: c.id,
    nome: c.nome,
    fantasia: c.fantasia,
    cnpj: c.cnpj,
    razaoSocial: c.razaoSocial,
    cidade: c.cidade,
    uf: c.uf,
    cep: c.cep,
    endereco: c.endereco,
    responsavel: c.responsavel,
    email: c.email,
    whatsapp: c.whatsapp,
    cargo: c.cargo,
    plano: c.plano,
    status: c.status,
    etapa: c.etapa,
    progresso: c.progresso ?? 0,
    valorImplantacao: c.valorImplantacao != null ? Number(c.valorImplantacao) : null,
    valorRecorrente: c.valorRecorrente != null ? Number(c.valorRecorrente) : null,
    formaPagamento: c.formaPagamento,
    diaVencimento: c.diaVencimento,
    inicioRecorrencia: c.inicioRecorrencia,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

router.get("/clinics", async (req, res): Promise<void> => {
  const params = ListClinicsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { status, plano, search, page = 1, pageSize = 20 } = params.data;

  const conditions = [];
  if (status) conditions.push(eq(clinicsTable.status, status));
  if (plano) conditions.push(eq(clinicsTable.plano, plano));
  if (search) {
    conditions.push(
      sql`(${ilike(clinicsTable.nome, `%${search}%`)} OR ${ilike(clinicsTable.cnpj, `%${search}%`)} OR ${ilike(clinicsTable.fantasia, `%${search}%`)})`
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = ((page ?? 1) - 1) * (pageSize ?? 20);

  const [clinics, totalResult] = await Promise.all([
    db.select().from(clinicsTable).where(where).limit(pageSize ?? 20).offset(offset).orderBy(clinicsTable.createdAt),
    db.select({ count: count() }).from(clinicsTable).where(where),
  ]);

  res.json(
    ListClinicsResponse.parse({
      data: clinics.map(mapClinic),
      total: totalResult[0]?.count ?? 0,
      page: page ?? 1,
      pageSize: pageSize ?? 20,
    })
  );
});

router.post("/clinics", async (req, res): Promise<void> => {
  const parsed = CreateClinicBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { nome, fantasia, cnpj, razaoSocial, cidade, uf, cep, endereco, responsavel, email, whatsapp, cargo, plano, valorImplantacao, valorRecorrente, formaPagamento, diaVencimento } = parsed.data;

  const [clinic] = await db.insert(clinicsTable).values({
    nome,
    fantasia: fantasia ?? null,
    cnpj,
    razaoSocial: razaoSocial ?? null,
    cidade: cidade ?? null,
    uf: uf ?? null,
    cep: cep ?? null,
    endereco: endereco ?? null,
    responsavel: responsavel ?? null,
    email: email ?? null,
    whatsapp: whatsapp ?? null,
    cargo: cargo ?? null,
    plano,
    valorImplantacao: valorImplantacao?.toString() ?? null,
    valorRecorrente: valorRecorrente?.toString() ?? null,
    formaPagamento: formaPagamento ?? null,
    diaVencimento: diaVencimento ?? null,
  }).returning();

  res.status(201).json(GetClinicResponse.parse(mapClinic(clinic)));
});

router.get("/clinics/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [clinic] = await db.select().from(clinicsTable).where(eq(clinicsTable.id, id));
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }

  res.json(GetClinicResponse.parse(mapClinic(clinic)));
});

router.patch("/clinics/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateClinicBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof clinicsTable.$inferInsert> = {};
  const d = parsed.data;
  if (d.nome != null) updates.nome = d.nome;
  if (d.fantasia !== undefined) updates.fantasia = d.fantasia;
  if (d.cnpj != null) updates.cnpj = d.cnpj;
  if (d.razaoSocial !== undefined) updates.razaoSocial = d.razaoSocial;
  if (d.cidade !== undefined) updates.cidade = d.cidade;
  if (d.uf !== undefined) updates.uf = d.uf;
  if (d.cep !== undefined) updates.cep = d.cep;
  if (d.endereco !== undefined) updates.endereco = d.endereco;
  if (d.responsavel !== undefined) updates.responsavel = d.responsavel;
  if (d.email !== undefined) updates.email = d.email;
  if (d.whatsapp !== undefined) updates.whatsapp = d.whatsapp;
  if (d.cargo !== undefined) updates.cargo = d.cargo;
  if (d.plano != null) updates.plano = d.plano;
  if (d.etapa != null) updates.etapa = d.etapa;
  if (d.progresso != null) updates.progresso = d.progresso;
  if (d.valorImplantacao !== undefined) updates.valorImplantacao = d.valorImplantacao?.toString() ?? null;
  if (d.valorRecorrente !== undefined) updates.valorRecorrente = d.valorRecorrente?.toString() ?? null;
  if (d.formaPagamento !== undefined) updates.formaPagamento = d.formaPagamento;
  if (d.diaVencimento !== undefined) updates.diaVencimento = d.diaVencimento;
  if (d.inicioRecorrencia !== undefined) updates.inicioRecorrencia = d.inicioRecorrencia;
  updates.updatedAt = new Date();

  const [clinic] = await db.update(clinicsTable).set(updates).where(eq(clinicsTable.id, id)).returning();
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }

  res.json(UpdateClinicResponse.parse(mapClinic(clinic)));
});

router.delete("/clinics/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [clinic] = await db.delete(clinicsTable).where(eq(clinicsTable.id, id)).returning();
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }

  res.sendStatus(204);
});

router.patch("/clinics/:id/status", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateClinicStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [clinic] = await db
    .update(clinicsTable)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(clinicsTable.id, id))
    .returning();

  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }

  await db.insert(clinicActivityTable).values({
    clinicId: id,
    tipo: "status_change",
    titulo: `Status alterado para ${parsed.data.status}`,
    descricao: parsed.data.motivo ?? null,
    autorNome: "Sistema",
  });

  res.json(UpdateClinicStatusResponse.parse(mapClinic(clinic)));
});

export default router;
