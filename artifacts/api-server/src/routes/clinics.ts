import { Router, type IRouter } from "express";
import { eq, ilike, and, count, sql } from "drizzle-orm";
import { db, clinicsTable, clinicActivityTable, clinicStatusHistoryTable, teamTable, sociosTable } from "@workspace/db";
import { sendEmail, sendEmailDetailed, buildInviteEmail, resolveAppUrl } from "../lib/email.js";
import { generateInviteCode } from "../middleware/auth";
import { objectStorageClient } from "../lib/objectStorage";
import { seedIcsData } from "../lib/ics-seed.js";
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

/**
 * Clinics router is split in two:
 *
 *   - `clinicsAdminRouter`  → endpoints that operate on the clinics table
 *     globally (list all, create, delete, change status, send platform invite).
 *     Mounted under `requireSuperAdmin` in `routes/index.ts`.
 *
 *   - `clinicsScopedRouter` → endpoints scoped to a single clinic by URL
 *     param `:id` (read clinic, update clinic, upload/remove legacy
 *     proposal/contract attachments). Mounted under `requireClinicAccess`
 *     so a `team_member` who manages that clinic also has access.
 *
 * Both routers are exported; the default export remains the scoped router
 * for any consumer that imports it directly.
 */
const clinicsAdminRouter: IRouter = Router();
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

clinicsAdminRouter.get("/clinics", async (req, res): Promise<void> => {
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

clinicsAdminRouter.post("/clinics", async (req, res): Promise<void> => {
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

  let seedResult: { delegacoes: number; risks: number; actions: number } | null = null;
  let seedError: unknown = null;

  try {
    seedResult = await seedIcsData(clinic.id, clinic.plano);
  } catch (err) {
    seedError = err;
    console.error(`[ics-seed] Failed to auto-seed ICS data for clinic ${clinic.id}:`, err);
  }

  try {
    if (seedResult !== null) {
      await db.insert(clinicActivityTable).values({
        clinicId: clinic.id,
        tipo: "ics_seed_auto",
        titulo: "Dados ICS inicializados automaticamente",
        descricao: `Delegações: ${seedResult.delegacoes}, Riscos: ${seedResult.risks}, Ações: ${seedResult.actions}`,
        autorNome: "Sistema",
      });
    } else {
      await db.insert(clinicActivityTable).values({
        clinicId: clinic.id,
        tipo: "ics_seed_warning",
        titulo: "Falha na inicialização automática dos dados ICS",
        descricao: seedError instanceof Error ? seedError.message : "Erro desconhecido. Use o botão de reprocessamento manual.",
        autorNome: "Sistema",
      });
    }
  } catch (logErr) {
    console.error(`[ics-seed] Failed to log seed outcome for clinic ${clinic.id}:`, logErr);
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

clinicsAdminRouter.delete("/clinics/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [clinic] = await db.delete(clinicsTable).where(eq(clinicsTable.id, id)).returning();
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }

  res.sendStatus(204);
});

clinicsAdminRouter.patch("/clinics/:id/status", async (req, res): Promise<void> => {
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

  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.startsWith("application/pdf")) {
    res.status(400).json({ error: "Apenas arquivos PDF são aceitos (Content-Type: application/pdf)" });
    return;
  }

  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    res.status(501).json({ error: "Object storage não está configurado. PRIVATE_OBJECT_DIR ausente." });
    return;
  }

  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const chunks: Buffer[] = [];
  let totalSize = 0;
  for await (const chunk of req) {
    totalSize += (chunk as Buffer).length;
    if (totalSize > MAX_FILE_SIZE) {
      res.status(413).json({ error: "Arquivo muito grande. Limite de 20 MB." });
      return;
    }
    chunks.push(chunk as Buffer);
  }
  const fileBuffer = Buffer.concat(chunks);

  if (fileBuffer.length === 0) {
    res.status(400).json({ error: "Arquivo vazio" });
    return;
  }

  const objectSubPath = `clinic-docs/${id}/${docType}-${Date.now()}.pdf`;
  const fullGcsPath = `${privateObjectDir}/${objectSubPath}`.replace(/\/+/g, "/");

  const pathParts = fullGcsPath.replace(/^\//, "").split("/");
  const bucketName = pathParts[0];
  const objectName = pathParts.slice(1).join("/");

  const bucket = objectStorageClient.bucket(bucketName);
  const gcsFile = bucket.file(objectName);

  await gcsFile.save(fileBuffer, {
    metadata: { contentType: "application/pdf" },
  });

  const servingUrl = `/api/storage/objects/${objectSubPath}`;

  const updateField = docType === "proposta"
    ? { propostaUrl: servingUrl }
    : { contratoUrl: servingUrl };

  await db.update(clinicsTable).set({ ...updateField, updatedAt: new Date() }).where(eq(clinicsTable.id, id));

  await db.insert(clinicActivityTable).values({
    clinicId: id,
    tipo: "documento_enviado",
    titulo: `${docType === "proposta" ? "Proposta" : "Contrato"} enviado`,
    descricao: objectSubPath,
    autorNome: "Super Admin",
  });

  res.json({ url: servingUrl, type: docType });
});

router.delete("/clinics/:id/documents", async (req, res): Promise<void> => {
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

  const existingUrl = docType === "proposta" ? clinic.propostaUrl : clinic.contratoUrl;
  if (!existingUrl) {
    res.status(404).json({ error: "Documento não encontrado" });
    return;
  }

  let storageDeleted = false;
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (privateObjectDir && existingUrl.startsWith("/api/storage/objects/")) {
    const objectSubPath = existingUrl.replace("/api/storage/objects/", "");
    const fullGcsPath = `${privateObjectDir}/${objectSubPath}`.replace(/\/+/g, "/");
    const pathParts = fullGcsPath.replace(/^\//, "").split("/");
    const bucketName = pathParts[0];
    const objectName = pathParts.slice(1).join("/");
    try {
      const bucket = objectStorageClient.bucket(bucketName);
      const gcsFile = bucket.file(objectName);
      const [exists] = await gcsFile.exists();
      if (exists) {
        await gcsFile.delete();
      }
      storageDeleted = true;
    } catch (err) {
      console.error("Failed to delete GCS file:", err);
    }
  } else {
    storageDeleted = true;
  }

  const updateField = docType === "proposta"
    ? { propostaUrl: null }
    : { contratoUrl: null };

  await db.update(clinicsTable).set({ ...updateField, updatedAt: new Date() }).where(eq(clinicsTable.id, id));

  await db.insert(clinicActivityTable).values({
    clinicId: id,
    tipo: "documento_removido",
    titulo: `${docType === "proposta" ? "Proposta" : "Contrato"} removido`,
    descricao: existingUrl,
    autorNome: "Super Admin",
  });

  res.json({ success: true, type: docType, storageDeleted });
});

clinicsAdminRouter.post("/clinics/:id/invite-user", async (req, res): Promise<void> => {
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

  const existingMember = await db
    .select()
    .from(teamTable)
    .where(and(eq(teamTable.clinicId, id), eq(teamTable.email, email)));

  let memberId: string;

  if (existingMember.length > 0) {
    memberId = existingMember[0].id;
    await db
      .update(teamTable)
      .set({ inviteStatus: "pending", temAcessoPlataforma: true, funcao: role, inviteRedeemedAt: null })
      .where(eq(teamTable.id, memberId));
  } else {
    const [newMember] = await db.insert(teamTable).values({
      clinicId: id,
      nome: email.split("@")[0],
      email,
      funcao: role,
      temAcessoPlataforma: true,
      inviteStatus: "pending",
    }).returning({ id: teamTable.id });
    memberId = newMember.id;
  }

  const appUrl = await resolveAppUrl(req);
  const { code, hash, expiresAt } = generateInviteCode();
  await db.update(teamTable).set({
    inviteCodeHash: hash,
    inviteCodeExpiresAt: expiresAt,
    inviteRedeemedAt: null,
  }).where(eq(teamTable.id, memberId));
  const inviteLink = `${appUrl}/convite?code=${encodeURIComponent(code)}`;

  await db.insert(clinicActivityTable).values({
    clinicId: id,
    tipo: "usuario_convidado",
    titulo: `Convite enviado para ${email}`,
    descricao: `Perfil: ${role}`,
    autorNome: "Super Admin",
  });

  const inviteHtml = buildInviteEmail({ email, role, magicLink: inviteLink, clinicName: clinic.nome ?? undefined });
  sendEmail({
    to: email,
    subject: `[IONEX360] Você foi convidado para a plataforma — ${clinic.nome}`,
    html: inviteHtml,
  }).catch(() => {});

  res.json({
    success: true,
    message: `Convite enviado para ${email}. O usuário receberá um email com o link de acesso.`,
    inviteLink,
  });
});

clinicsAdminRouter.post(
  "/clinics/:id/team/:teamMemberId/resend-invite",
  async (req, res): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const teamMemberId = Array.isArray(req.params.teamMemberId)
      ? req.params.teamMemberId[0]
      : req.params.teamMemberId;

    const [clinic] = await db.select().from(clinicsTable).where(eq(clinicsTable.id, id));
    if (!clinic) {
      res.status(404).json({ error: "Clínica não encontrada." });
      return;
    }

    const [member] = await db
      .select()
      .from(teamTable)
      .where(and(eq(teamTable.id, teamMemberId), eq(teamTable.clinicId, id)));
    if (!member) {
      res.status(404).json({ error: "Membro da equipe não encontrado nesta clínica." });
      return;
    }

    if (!member.email) {
      res.status(400).json({ error: "Este membro não possui e-mail cadastrado. Edite o cadastro antes de reenviar o convite." });
      return;
    }

    if (!member.temAcessoPlataforma) {
      res.status(400).json({ error: "Este membro não tem acesso à plataforma. Conceda acesso antes de reenviar o convite." });
      return;
    }

    const appUrl = await resolveAppUrl(req);
    const { code, hash, expiresAt } = generateInviteCode();
    await db
      .update(teamTable)
      .set({
        inviteCodeHash: hash,
        inviteCodeExpiresAt: expiresAt,
        inviteRedeemedAt: null,
        inviteStatus: "pending",
      })
      .where(eq(teamTable.id, member.id));

    const inviteLink = `${appUrl}/convite?code=${encodeURIComponent(code)}`;

    await db.insert(clinicActivityTable).values({
      clinicId: id,
      tipo: "usuario_convidado",
      titulo: `Convite reenviado para ${member.email}`,
      descricao: `Perfil: ${member.funcao ?? "colaborador"}`,
      autorNome: "Super Admin",
    });

    const inviteHtml = buildInviteEmail({
      email: member.email,
      role: member.funcao ?? "colaborador",
      magicLink: inviteLink,
      clinicName: clinic.nome ?? undefined,
    });
    const sendResult = await sendEmailDetailed({
      to: member.email,
      subject: `[IONEX360] Convite reenviado — ${clinic.nome}`,
      html: inviteHtml,
    });

    if (!sendResult.ok) {
      req.log?.warn?.(
        { err: sendResult.error, status: sendResult.status, memberId: member.id },
        "resend-invite email send failed",
      );
      const detail = sendResult.error ?? "falha desconhecida no provedor de e-mail";
      res.status(502).json({
        error: `Não foi possível enviar o e-mail de convite (${detail}). O link foi gerado e pode ser copiado manualmente.`,
        inviteLink,
      });
      return;
    }

    res.json({
      success: true,
      message: `Convite reenviado para ${member.email}.`,
      inviteLink,
    });
  },
);

export { clinicsAdminRouter };
export default router;
