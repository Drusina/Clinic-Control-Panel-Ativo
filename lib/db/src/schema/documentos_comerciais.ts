import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";

/**
 * Snapshot imutável das condições comerciais usadas no momento em que um
 * documento (proposta/contrato) foi gerado. Permite detectar quando as
 * condições atuais da clínica divergem do que já foi formalizado.
 */
export type CondicoesComerciaisSnapshot = {
  valorImplantacao: number | null;
  valorRecorrente: number | null;
  formaPagamento: string | null;
  diaVencimento: number | null;
  reajusteIndice: string | null;
  inicioRecorrencia: string | null;
  prazoContratoMeses: number | null;
  validadePropostaDias: number | null;
  dataPrevistaInicio: string | null;
  responsavelComercial: string | null;
  observacoesComerciais: string | null;
  condicoesEspeciais: string | null;
};

/**
 * Signatário de um contrato (suporta múltiplas partes). Os campos de evidência
 * de assinatura são preenchidos na Etapa 3 (assinatura eletrônica) — espelham o
 * modelo de `lgpd_signature_requests`.
 */
export type DocumentoComercialSignatario = {
  nome: string;
  email: string;
  cargo?: string | null;
  papel?: string | null; // contratante | contratada | testemunha
  ordem?: number;
  status?: string; // pendente | enviado | assinado | recusado
  signingToken?: string | null;
  signingTokenExpiresAt?: string | null;
  signerCpf?: string | null;
  signerIp?: string | null;
  signerUserAgent?: string | null;
  verificationCode?: string | null;
  signedStoragePath?: string | null;
  signedAt?: string | null;
};

/**
 * Documentos comerciais versionados (Proposta / Contrato) da Central Comercial
 * CLINIONEX360. Cada geração cria uma nova linha com `versao` incremental e um
 * `snapshot` das condições comerciais. Os campos de assinatura (token +
 * expiração + evidência) espelham `lgpd_signature_requests` e só são usados a
 * partir da Etapa 3. Para contratos multi-parte, cada signatário guarda sua
 * própria evidência no array JSONB `signatarios`.
 *
 * IMPORTANTE: `clinics.propostaUrl`/`clinics.contratoUrl` representam o
 * documento FINAL (assinado ou PDF final enviado manualmente) — NÃO um rascunho
 * recém-gerado. Por isso só a assinatura in-platform (`lib/comercial-signing.ts`)
 * e o upload manual (`routes/clinics.ts`) populam essas URLs; a geração de
 * documento (`routes/comercial.ts`) NÃO. A Trilha de Implementação
 * (`lib/trilha.ts`) trata URL não-vazia como marco concluído, então mirrorar um
 * rascunho concluiria o marco prematuramente. Esta tabela carrega o estado
 * granular do documento; a tabela `clinics` permanece a fonte para a Trilha.
 */
export const documentosComerciaisTable = pgTable(
  "documentos_comerciais",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinicsTable.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(), // proposta | contrato
    versao: integer("versao").notNull().default(1),
    // rascunho | gerado | enviado | assinado | recusado | cancelado | expirado
    status: text("status").notNull().default("rascunho"),
    titulo: text("titulo"),
    snapshot: jsonb("snapshot").$type<CondicoesComerciaisSnapshot>(),
    pdfPath: text("pdf_path"),
    docHash: text("doc_hash"),
    // Nome de quem gerou esta versão (autor exibido no histórico de versões).
    geradoPorNome: text("gerado_por_nome"),

    // Assinatura simples de parte única (proposta) — espelha lgpd_signature_requests.
    signingToken: text("signing_token").unique(),
    signingTokenExpiresAt: timestamp("signing_token_expires_at", {
      withTimezone: true,
    }),
    signatarioNome: text("signatario_nome"),
    signatarioEmail: text("signatario_email"),
    signatarioCargo: text("signatario_cargo"),
    signerCpf: text("signer_cpf"),
    signerIp: text("signer_ip"),
    signerUserAgent: text("signer_user_agent"),
    signedStoragePath: text("signed_storage_path"),
    verificationCode: text("verification_code"),

    // Múltiplos signatários (contrato) com evidência por parte.
    signatarios: jsonb("signatarios").$type<DocumentoComercialSignatario[]>(),

    geradoEm: timestamp("gerado_em", { withTimezone: true }),
    enviadoEm: timestamp("enviado_em", { withTimezone: true }),
    aceitoEm: timestamp("aceito_em", { withTimezone: true }),
    validadeAte: timestamp("validade_ate", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("documentos_comerciais_clinic_tipo_idx").on(t.clinicId, t.tipo),
    index("documentos_comerciais_status_idx").on(t.status),
    // Garante que duas gerações concorrentes nunca colidam na mesma versão
    // (backstop ao pg_advisory_xact_lock usado na geração).
    uniqueIndex("documentos_comerciais_clinic_tipo_versao_uniq").on(
      t.clinicId,
      t.tipo,
      t.versao,
    ),
  ],
);

export const insertDocumentoComercialSchema = createInsertSchema(
  documentosComerciaisTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDocumentoComercial = z.infer<
  typeof insertDocumentoComercialSchema
>;
export type DocumentoComercial = typeof documentosComerciaisTable.$inferSelect;
