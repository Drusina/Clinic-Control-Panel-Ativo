import { Router, type IRouter, type Request } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  clinicsTable,
  clinicActivityTable,
  documentosComerciaisTable,
} from "@workspace/db";
import {
  SaveCondicoesComerciaisBody,
  SaveCondicoesComerciaisResponse,
  ListDocumentosComerciaisQueryParams,
} from "@workspace/api-zod";
import { mapClinic } from "./clinics.js";

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

export default router;
