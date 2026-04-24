import { Router, type IRouter } from "express";
import { eq, ilike, and, count, sql } from "drizzle-orm";
import { db, clinicsTable, clinicActivityTable, clinicStatusHistoryTable, teamTable, sociosTable } from "@workspace/db";
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
import { z } from "zod";

const InviteUserBody = z.object({
  email: z.string().email(),
  role: z.string(),
});

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
    suspensoMotivo: c.suspensoMotivo,
    etapa: c.etapa,
    progresso: c.progresso ?? 0,
    valorImplantacao: c.valorImplantacao != null ? Number(c.valorImplantacao) : null,
    valorRecorrente: c.valorRecorrente != null ? Number(c.valorRecorrente) : null,
    formaPagamento: c.formaPagamento,
    diaVencimento: c.diaVencimento,
    reajusteIndice: c.reajusteIndice,
    inicioRecorrencia: c.inicioRecorrencia,
    cnae: c.cnae,
    situacaoCadastral: c.situacaoCadastral,
    capitalSocial: c.capitalSocial != null ? Number(c.capitalSocial) : null,
    dataAbertura: c.dataAbertura,
    propostaUrl: c.propostaUrl,
    contratoUrl: c.contratoUrl,
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

  const { nome, fantasia, cnpj, razaoSocial, cidade, uf, cep, endereco, responsavel, email, whatsapp, cargo, plano, valorImplantacao, valorRecorrente, formaPagamento, diaVencimento, cnae, situacaoCadastral, capitalSocial, dataAbertura, qsa } = parsed.data;

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
    cnae: cnae ?? null,
    situacaoCadastral: situacaoCadastral ?? null,
    capitalSocial: capitalSocial?.toString() ?? null,
    dataAbertura: dataAbertura ?? null,
  }).returning();

  if (qsa && qsa.length > 0) {
    await db.insert(sociosTable).values(
      qsa.map((partner) => ({
        clinicId: clinic.id,
        nome: partner.nome,
        qualificacao: partner.qualificacao ?? null,
        dataEntrada: partner.dataEntrada ?? null,
      }))
    );
  }

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
  if (d.reajusteIndice !== undefined) updates.reajusteIndice = d.reajusteIndice;
  if (d.cnae !== undefined) updates.cnae = d.cnae;
  if (d.situacaoCadastral !== undefined) updates.situacaoCadastral = d.situacaoCadastral;
  if (d.capitalSocial !== undefined) updates.capitalSocial = d.capitalSocial?.toString() ?? null;
  if (d.dataAbertura !== undefined) updates.dataAbertura = d.dataAbertura;
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

  const updates: Partial<typeof clinicsTable.$inferInsert> = {
    status: parsed.data.status,
    updatedAt: new Date(),
  };

  if (parsed.data.status === "suspensa") {
    if (!parsed.data.motivo || !parsed.data.motivo.trim()) {
      res.status(400).json({ error: "Motivo de suspensão é obrigatório" });
      return;
    }
    updates.suspensoMotivo = parsed.data.motivo.trim();
  } else {
    updates.suspensoMotivo = null;
  }

  const [clinic] = await db
    .update(clinicsTable)
    .set(updates)
    .where(eq(clinicsTable.id, id))
    .returning();

  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }

  await Promise.all([
    db.insert(clinicStatusHistoryTable).values({
      clinicId: id,
      status: parsed.data.status,
      motivo: parsed.data.motivo ?? null,
      autorNome: "Super Admin",
    }),
    db.insert(clinicActivityTable).values({
      clinicId: id,
      tipo: "status_change",
      titulo: `Status alterado para ${parsed.data.status}`,
      descricao: parsed.data.motivo ?? null,
      autorNome: "Super Admin",
    }),
  ]);

  res.json(UpdateClinicStatusResponse.parse(mapClinic(clinic)));
});

router.post("/clinics/:id/documents", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [clinic] = await db.select().from(clinicsTable).where(eq(clinicsTable.id, id));
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }

  const docType = req.query.type as string;
  if (docType !== "proposta" && docType !== "contrato") {
    res.status(400).json({ error: "Query param 'type' must be 'proposta' or 'contrato'" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    res.status(501).json({ error: "Supabase Storage não está configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY." });
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const fileBuffer = Buffer.concat(chunks);

  if (fileBuffer.length === 0) {
    res.status(400).json({ error: "Arquivo vazio" });
    return;
  }

  const fileName = `${id}/${docType}-${Date.now()}.pdf`;
  const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/clinic-docs/${fileName}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/pdf",
      "x-upsert": "true",
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text();
    res.status(uploadRes.status).json({ error: `Erro ao fazer upload: ${errBody}` });
    return;
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/clinic-docs/${fileName}`;

  const updateField = docType === "proposta"
    ? { propostaUrl: publicUrl }
    : { contratoUrl: publicUrl };

  await db.update(clinicsTable).set({ ...updateField, updatedAt: new Date() }).where(eq(clinicsTable.id, id));

  await db.insert(clinicActivityTable).values({
    clinicId: id,
    tipo: "documento_enviado",
    titulo: `${docType === "proposta" ? "Proposta" : "Contrato"} enviado`,
    descricao: fileName,
    autorNome: "Super Admin",
  });

  res.json({ url: publicUrl, type: docType });
});

router.post("/clinics/:id/invite-user", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const parsed = InviteUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, role } = parsed.data;

  const [clinic] = await db.select().from(clinicsTable).where(eq(clinicsTable.id, id));
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    res.status(501).json({
      success: false,
      message: "Convite por email não está configurado: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários.",
    });
    return;
  }

  const inviteRes = await fetch(`${supabaseUrl}/auth/v1/invite`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
      "apikey": serviceRoleKey,
    },
    body: JSON.stringify({
      email,
      data: { role, clinic_id: id, clinic_nome: clinic.nome },
    }),
  });

  if (!inviteRes.ok) {
    const errorBody = await inviteRes.text();
    res.status(inviteRes.status).json({ success: false, message: `Erro ao enviar convite: ${errorBody}` });
    return;
  }

  const existingMember = await db
    .select()
    .from(teamTable)
    .where(and(eq(teamTable.clinicId, id), eq(teamTable.email, email)));

  if (existingMember.length > 0) {
    await db
      .update(teamTable)
      .set({ inviteStatus: "pending", temAcessoPlataforma: true })
      .where(eq(teamTable.id, existingMember[0].id));
  } else {
    await db.insert(teamTable).values({
      clinicId: id,
      nome: email.split("@")[0],
      email,
      funcao: role,
      temAcessoPlataforma: true,
      inviteStatus: "pending",
    });
  }

  await db.insert(clinicActivityTable).values({
    clinicId: id,
    tipo: "usuario_convidado",
    titulo: `Convite enviado para ${email}`,
    descricao: `Perfil: ${role}`,
    autorNome: "Super Admin",
  });

  res.json({ success: true, message: `Convite enviado para ${email}. O usuário receberá um email com o link de acesso.` });
});

export default router;
