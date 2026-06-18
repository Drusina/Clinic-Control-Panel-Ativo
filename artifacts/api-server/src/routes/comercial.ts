import { Router, type IRouter, type Request } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  clinicsTable,
  clinicActivityTable,
  documentosComerciaisTable,
  type CondicoesComerciaisSnapshot,
  type DocumentoComercialSignatario,
} from "@workspace/db";
import {
  SaveCondicoesComerciaisBody,
  SaveCondicoesComerciaisResponse,
  ListDocumentosComerciaisQueryParams,
  EnviarAssinaturaComercialBody,
} from "@workspace/api-zod";
import { mapClinic } from "./clinics.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { getConfig } from "../lib/config.js";
import { renderCommercialPdf } from "../lib/commercial-pdf.js";
import { COMMERCIAL_TEMPLATES } from "../lib/commercial-templates.js";
import type { ContratadaInfo, ContratanteInfo } from "../lib/lgpd-pdf.js";
import { generateToken } from "../lib/signing-utils.js";
import {
  buildSigningRequestEmail,
  sendEmailDetailed,
  resolveAppUrl,
} from "../lib/email.js";

const objectStorage = new ObjectStorageService();

/**
 * Central Comercial CLINIONEX360 — endpoints escopados por clínica
 * (`/clinics/:clinicId/...`), montados sob `requireClinicAccess`.
 *
 *   - PUT  /clinics/:clinicId/condicoes-comerciais → salva as condições
 *          comerciais na própria ficha da clínica (sem recadastro).
 *   - GET  /clinics/:clinicId/documentos-comerciais → lista documentos
 *          comerciais versionados (proposta/contrato).
 */
const router: IRouter = Router();

function resolveActor(req: Request): string {
  const u = (req as { user?: { nome?: string; email?: string } }).user;
  return u?.nome ?? u?.email ?? "Super Admin";
}

function mapDocumentoComercial(d: typeof documentosComerciaisTable.$inferSelect) {
  return {
    id: d.id,
    clinicId: d.clinicId,
    tipo: d.tipo,
    versao: d.versao,
    status: d.status,
    titulo: d.titulo,
    pdfPath: d.pdfPath,
    docHash: d.docHash,
    geradoPorNome: d.geradoPorNome,
    snapshot: d.snapshot ?? null,
    signatarios: d.signatarios ?? null,
    geradoEm: d.geradoEm ? d.geradoEm.toISOString() : null,
    enviadoEm: d.enviadoEm ? d.enviadoEm.toISOString() : null,
    aceitoEm: d.aceitoEm ? d.aceitoEm.toISOString() : null,
    validadeAte: d.validadeAte ? d.validadeAte.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

/**
 * Builds an immutable snapshot of the clinic's current commercial conditions
 * (espelha `clinicToSnapshot` do frontend). Os campos numéricos da clínica são
 * persistidos como `numeric` (string), por isso convertemos para number aqui.
 */
function clinicRowToSnapshot(
  c: typeof clinicsTable.$inferSelect,
): CondicoesComerciaisSnapshot {
  return {
    valorImplantacao:
      c.valorImplantacao != null ? Number(c.valorImplantacao) : null,
    valorRecorrente:
      c.valorRecorrente != null ? Number(c.valorRecorrente) : null,
    formaPagamento: c.formaPagamento ?? null,
    diaVencimento: c.diaVencimento ?? null,
    reajusteIndice: c.reajusteIndice ?? null,
    inicioRecorrencia: c.inicioRecorrencia ?? null,
    prazoContratoMeses: c.prazoContratoMeses ?? null,
    validadePropostaDias: c.validadePropostaDias ?? null,
    dataPrevistaInicio: c.dataPrevistaInicio ?? null,
    responsavelComercial: c.responsavelComercial ?? null,
    observacoesComerciais: c.observacoesComerciais ?? null,
    condicoesEspeciais: c.condicoesEspeciais ?? null,
  };
}

/** Dados da CONTRATADA (IONEX360) — geridos em `/admin/configuracoes`. */
async function loadContratada(): Promise<ContratadaInfo> {
  return {
    razao_social: (await getConfig("contratada_razao_social")) ?? "",
    cnpj: (await getConfig("contratada_cnpj")) ?? "",
    endereco: (await getConfig("contratada_endereco")) ?? "",
    cidade_uf: (await getConfig("contratada_cidade_uf")) ?? "",
    cep: (await getConfig("contratada_cep")) ?? "",
    representante_nome: (await getConfig("contratada_representante_nome")) ?? "",
    representante_cpf: (await getConfig("contratada_representante_cpf")) ?? "",
    representante_cargo:
      (await getConfig("contratada_representante_cargo")) ?? "",
  };
}

/** Dados da CONTRATANTE (clínica) mapeados a partir da ficha cadastral. */
function clinicToContratante(
  c: typeof clinicsTable.$inferSelect,
): ContratanteInfo {
  return {
    razao_social: c.razaoSocial ?? c.nome,
    nome_fantasia: c.fantasia ?? c.nome,
    cnpj: c.cnpj,
    endereco: c.endereco ?? "",
    cidade_uf: [c.cidade, c.uf].filter(Boolean).join("/"),
    cep: c.cep ?? "",
    responsavel: c.responsavel ?? "",
  };
}

/**
 * Faz upload de um PDF para um caminho determinístico sob o bucket privado e
 * retorna o caminho canônico `/objects/...` para persistência (mesmo padrão de
 * `lgpd-signing.ts`).
 */
async function uploadPdfToPath(
  bytes: Uint8Array,
  relativePath: string,
): Promise<string> {
  const { uploadUrl, objectPath } =
    await objectStorage.getCustomEntityUploadURL(relativePath);
  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: Buffer.from(bytes),
  });
  if (!upload.ok) {
    const txt = await upload.text();
    throw new Error(`Upload PDF failed: ${upload.status} ${txt}`);
  }
  return objectPath;
}

/** Converte o caminho canônico `/objects/X` na URL servível `/api/storage/objects/X`. */
function objectPathToServingUrl(objectPath: string): string {
  return `/api/storage/objects/${objectPath.replace(/^\/objects\//, "")}`;
}

function parseTipo(raw: string | string[]): "proposta" | "contrato" | null {
  const tipo = Array.isArray(raw) ? raw[0] : raw;
  return tipo === "proposta" || tipo === "contrato" ? tipo : null;
}

router.put(
  "/clinics/:clinicId/condicoes-comerciais",
  async (req, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId)
      ? req.params.clinicId[0]
      : req.params.clinicId;

    const parsed = SaveCondicoesComerciaisBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const d = parsed.data;

    const updates: Partial<typeof clinicsTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (d.valorImplantacao !== undefined)
      updates.valorImplantacao = d.valorImplantacao?.toString() ?? null;
    if (d.valorRecorrente !== undefined)
      updates.valorRecorrente = d.valorRecorrente?.toString() ?? null;
    if (d.formaPagamento !== undefined) updates.formaPagamento = d.formaPagamento;
    if (d.diaVencimento !== undefined) updates.diaVencimento = d.diaVencimento;
    if (d.reajusteIndice !== undefined) updates.reajusteIndice = d.reajusteIndice;
    if (d.inicioRecorrencia !== undefined)
      updates.inicioRecorrencia = d.inicioRecorrencia;
    if (d.prazoContratoMeses !== undefined)
      updates.prazoContratoMeses = d.prazoContratoMeses;
    if (d.validadePropostaDias !== undefined)
      updates.validadePropostaDias = d.validadePropostaDias;
    if (d.dataPrevistaInicio !== undefined)
      updates.dataPrevistaInicio = d.dataPrevistaInicio;
    if (d.responsavelComercial !== undefined)
      updates.responsavelComercial = d.responsavelComercial;
    if (d.observacoesComerciais !== undefined)
      updates.observacoesComerciais = d.observacoesComerciais;
    if (d.condicoesEspeciais !== undefined)
      updates.condicoesEspeciais = d.condicoesEspeciais;

    const [clinic] = await db
      .update(clinicsTable)
      .set(updates)
      .where(eq(clinicsTable.id, clinicId))
      .returning();
    if (!clinic) {
      res.status(404).json({ error: "Clinic not found" });
      return;
    }

    await db.insert(clinicActivityTable).values({
      clinicId,
      tipo: "comercial",
      titulo: "Condições comerciais salvas",
      descricao: "As condições comerciais da Central Comercial foram atualizadas.",
      autorNome: resolveActor(req),
    });

    res.json(SaveCondicoesComerciaisResponse.parse(mapClinic(clinic)));
  },
);

router.get(
  "/clinics/:clinicId/documentos-comerciais",
  async (req, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId)
      ? req.params.clinicId[0]
      : req.params.clinicId;

    const params = ListDocumentosComerciaisQueryParams.safeParse(req.query);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const tipo = params.data.tipo;

    const conditions = [eq(documentosComerciaisTable.clinicId, clinicId)];
    if (tipo) conditions.push(eq(documentosComerciaisTable.tipo, tipo));

    const docs = await db
      .select()
      .from(documentosComerciaisTable)
      .where(and(...conditions))
      .orderBy(
        desc(documentosComerciaisTable.tipo),
        desc(documentosComerciaisTable.versao),
      );

    res.json(docs.map(mapDocumentoComercial));
  },
);

router.post(
  "/clinics/:clinicId/documentos-comerciais/:tipo/gerar",
  async (req, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId)
      ? req.params.clinicId[0]
      : req.params.clinicId;
    const tipo = parseTipo(req.params.tipo);
    if (!tipo) {
      res.status(400).json({ error: "tipo deve ser 'proposta' ou 'contrato'" });
      return;
    }

    const [clinic] = await db
      .select()
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId));
    if (!clinic) {
      res.status(404).json({ error: "Clinic not found" });
      return;
    }

    const template = COMMERCIAL_TEMPLATES[tipo];
    const contratada = await loadContratada();
    const contratante = clinicToContratante(clinic);
    const conditions = clinicRowToSnapshot(clinic);
    const now = new Date();
    const geradoPorNome = resolveActor(req);

    const created = await db.transaction(async (tx) => {
      // Serializa gerações concorrentes da mesma clínica/tipo para que a versão
      // calculada seja sempre consistente (a uniqueIndex é o backstop).
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`gerar-doc-comercial:${clinicId}:${tipo}`}))`,
      );

      const [maxRow] = await tx
        .select({ versao: documentosComerciaisTable.versao })
        .from(documentosComerciaisTable)
        .where(
          and(
            eq(documentosComerciaisTable.clinicId, clinicId),
            eq(documentosComerciaisTable.tipo, tipo),
          ),
        )
        .orderBy(desc(documentosComerciaisTable.versao))
        .limit(1);
      const versao = (maxRow?.versao ?? 0) + 1;

      const { bytes, hash } = await renderCommercialPdf({
        tipo,
        titulo: template.titulo,
        corpo: template.corpo,
        versao,
        contratada,
        contratante,
        conditions,
        data: now,
      });

      const relativePath = `clinics/${clinicId}/comercial/${tipo}-v${versao}-${Date.now()}.pdf`;
      const objectPath = await uploadPdfToPath(bytes, relativePath);

      const validadeAte =
        tipo === "proposta" && conditions.validadePropostaDias != null
          ? new Date(
              now.getTime() +
                conditions.validadePropostaDias * 24 * 60 * 60 * 1000,
            )
          : null;

      const [doc] = await tx
        .insert(documentosComerciaisTable)
        .values({
          clinicId,
          tipo,
          versao,
          status: "gerado",
          titulo: template.titulo,
          snapshot: conditions,
          pdfPath: objectPath,
          docHash: hash,
          geradoPorNome,
          geradoEm: now,
          validadeAte,
        })
        .returning();

      // Espelha a URL servível na ficha da clínica para que a Trilha de
      // Implementação detecte o marco automaticamente (ver `lib/trilha.ts`).
      const servingUrl = objectPathToServingUrl(objectPath);
      const urlField =
        tipo === "proposta"
          ? { propostaUrl: servingUrl }
          : { contratoUrl: servingUrl };
      await tx
        .update(clinicsTable)
        .set({ ...urlField, updatedAt: new Date() })
        .where(eq(clinicsTable.id, clinicId));

      await tx.insert(clinicActivityTable).values({
        clinicId,
        tipo: "comercial",
        titulo: `${tipo === "proposta" ? "Proposta" : "Contrato"} gerado`,
        descricao: `${tipo === "proposta" ? "Proposta" : "Contrato"} v${versao} gerado a partir das condições comerciais.`,
        autorNome: geradoPorNome,
      });

      return doc;
    });

    res.status(201).json(mapDocumentoComercial(created));
  },
);

router.post(
  "/clinics/:clinicId/documentos-comerciais/:tipo/preview",
  async (req, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId)
      ? req.params.clinicId[0]
      : req.params.clinicId;
    const tipo = parseTipo(req.params.tipo);
    if (!tipo) {
      res.status(400).json({ error: "tipo deve ser 'proposta' ou 'contrato'" });
      return;
    }

    const [clinic] = await db
      .select()
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId));
    if (!clinic) {
      res.status(404).json({ error: "Clinic not found" });
      return;
    }

    const template = COMMERCIAL_TEMPLATES[tipo];
    const contratada = await loadContratada();
    const contratante = clinicToContratante(clinic);
    const conditions = clinicRowToSnapshot(clinic);

    const [maxRow] = await db
      .select({ versao: documentosComerciaisTable.versao })
      .from(documentosComerciaisTable)
      .where(
        and(
          eq(documentosComerciaisTable.clinicId, clinicId),
          eq(documentosComerciaisTable.tipo, tipo),
        ),
      )
      .orderBy(desc(documentosComerciaisTable.versao))
      .limit(1);
    const versao = (maxRow?.versao ?? 0) + 1;

    const { bytes } = await renderCommercialPdf({
      tipo,
      titulo: template.titulo,
      corpo: template.corpo,
      versao,
      contratada,
      contratante,
      conditions,
    });

    res.status(200);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${tipo}-preview.pdf"`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(Buffer.from(bytes));
  },
);

const SIGNING_TOKEN_TTL_DAYS = 30;

/** Plano de envio de e-mail montado em memória ANTES de qualquer persistência. */
interface PlannedEmail {
  to: string;
  nome: string;
  token: string;
  signatureLink: string;
}

/**
 * Envia um documento comercial (proposta/contrato) para assinatura eletrônica
 * INTERNA (Lei 14.063/2020), reaproveitando o fluxo público `/assinar/:token`.
 *
 *   - Proposta → `signatario` único (colunas single-signer do documento).
 *   - Contrato → `signatarios` (cada parte recebe seu próprio token; o documento
 *                só vira "assinado" quando TODAS assinarem — ver comercial-signing).
 *
 * Política de e-mail (espelha `dispatchPlatformInvite`): os tokens são gerados em
 * memória e os e-mails enviados ANTES de persistir; se QUALQUER envio falhar,
 * nada é gravado e devolvemos 502 — evita deixar o documento num estado "enviado"
 * sem que o signatário tenha recebido o link.
 */
router.post(
  "/clinics/:clinicId/documentos-comerciais/:documentoId/enviar-assinatura",
  async (req, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId)
      ? req.params.clinicId[0]
      : req.params.clinicId;
    const documentoId = Array.isArray(req.params.documentoId)
      ? req.params.documentoId[0]
      : req.params.documentoId;

    const parsed = EnviarAssinaturaComercialBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [doc] = await db
      .select()
      .from(documentosComerciaisTable)
      .where(
        and(
          eq(documentosComerciaisTable.id, documentoId),
          eq(documentosComerciaisTable.clinicId, clinicId),
        ),
      );
    if (!doc) {
      res.status(404).json({ error: "Documento não encontrado" });
      return;
    }
    if (!doc.pdfPath || !doc.docHash) {
      res
        .status(409)
        .json({ error: "Gere o PDF do documento antes de enviar para assinatura." });
      return;
    }
    if (doc.status === "assinado" || doc.status === "assinando") {
      res.status(409).json({
        error: "Este documento já foi assinado e não pode ser reenviado.",
      });
      return;
    }
    // Não destrói assinaturas já coletadas num contrato parcialmente assinado.
    if ((doc.signatarios ?? []).some((s) => s.status === "assinado")) {
      res.status(409).json({
        error:
          "Algumas partes já assinaram este contrato. Gere uma nova versão para reenviar.",
      });
      return;
    }

    const [clinic] = await db
      .select()
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId));
    if (!clinic) {
      res.status(404).json({ error: "Clinic not found" });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + SIGNING_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    const appUrl = await resolveAppUrl(req);
    const termoNome = doc.titulo ?? (doc.tipo === "proposta" ? "Proposta" : "Contrato");
    const clinicName = clinic.fantasia ?? clinic.nome;
    const expiresLabel = expiresAt.toLocaleDateString("pt-BR");

    // ─── Build the send plan (proposta single / contrato multi) ───────────
    const plan: PlannedEmail[] = [];
    let contratoSignatarios: DocumentoComercialSignatario[] | null = null;

    if (doc.tipo === "proposta") {
      const s = parsed.data.signatario;
      if (!s) {
        res
          .status(400)
          .json({ error: "Informe o signatário (signatario) da proposta." });
        return;
      }
      const token = generateToken();
      plan.push({
        to: s.email,
        nome: s.nome,
        token,
        signatureLink: `${appUrl}/assinar/${token}`,
      });
    } else {
      const list = parsed.data.signatarios ?? [];
      if (list.length === 0) {
        res.status(400).json({
          error: "Informe ao menos um signatário (signatarios) do contrato.",
        });
        return;
      }
      const seen = new Set<string>();
      for (const s of list) {
        const key = s.email.trim().toLowerCase();
        if (seen.has(key)) {
          res.status(400).json({
            error: `E-mail duplicado entre os signatários: ${s.email}`,
          });
          return;
        }
        seen.add(key);
      }
      contratoSignatarios = list.map((s, i) => {
        const token = generateToken();
        plan.push({
          to: s.email,
          nome: s.nome,
          token,
          signatureLink: `${appUrl}/assinar/${token}`,
        });
        return {
          nome: s.nome,
          email: s.email,
          cargo: s.cargo ?? null,
          papel: s.papel ?? null,
          ordem: s.ordem ?? i,
          status: "enviado",
          signingToken: token,
          signingTokenExpiresAt: expiresAt.toISOString(),
          signerCpf: null,
          signerIp: null,
          signerUserAgent: null,
          verificationCode: null,
          signedStoragePath: null,
          signedAt: null,
        };
      });
    }

    // ─── Send ALL emails first; persist only if every send succeeded ──────
    for (const p of plan) {
      const html = buildSigningRequestEmail({
        signatarioNome: p.nome,
        termoNome,
        signatureLink: p.signatureLink,
        clinicName,
        expiresAt: expiresLabel,
      });
      const result = await sendEmailDetailed({
        to: p.to,
        subject: `[CLINIONEX360] Assine: ${termoNome}`,
        html,
      });
      if (!result.ok) {
        req.log.error(
          { docId: doc.id, clinicId, to: p.to, emailError: result.error },
          "comercial enviar-assinatura email failed",
        );
        res.status(502).json({
          error: `Falha ao enviar e-mail para ${p.to}. Nenhum link foi gerado — tente novamente.`,
        });
        return;
      }
    }

    // ─── Persist the send state ───────────────────────────────────────────
    const updates: Partial<typeof documentosComerciaisTable.$inferInsert> = {
      status: "enviado",
      enviadoEm: now,
      updatedAt: now,
    };
    if (doc.tipo === "proposta") {
      const s = parsed.data.signatario!;
      const token = plan[0].token;
      updates.signingToken = token;
      updates.signingTokenExpiresAt = expiresAt;
      updates.signatarioNome = s.nome;
      updates.signatarioEmail = s.email;
      updates.signatarioCargo = s.cargo ?? null;
      // Limpa qualquer evidência de tentativa anterior ao reenviar.
      updates.signerCpf = null;
      updates.signerIp = null;
      updates.signerUserAgent = null;
      updates.verificationCode = null;
      updates.signedStoragePath = null;
      updates.aceitoEm = null;
    } else {
      updates.signatarios = contratoSignatarios;
      updates.signedStoragePath = null;
      updates.aceitoEm = null;
    }

    const [updated] = await db
      .update(documentosComerciaisTable)
      .set(updates)
      .where(eq(documentosComerciaisTable.id, doc.id))
      .returning();

    await db.insert(clinicActivityTable).values({
      clinicId,
      tipo: "comercial",
      titulo: `${doc.tipo === "proposta" ? "Proposta" : "Contrato"} enviado para assinatura`,
      descricao:
        doc.tipo === "proposta"
          ? `Proposta v${doc.versao} enviada para assinatura eletrônica de ${plan[0].nome}.`
          : `Contrato v${doc.versao} enviado para assinatura eletrônica de ${plan.length} signatário(s).`,
      autorNome: resolveActor(req),
    });

    res.json(mapDocumentoComercial(updated));
  },
);

export default router;
