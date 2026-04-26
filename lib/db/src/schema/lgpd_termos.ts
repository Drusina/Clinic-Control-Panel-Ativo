import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";

export const lgpdTermosTable = pgTable("lgpd_termos", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  status: text("status").notNull().default("pendente"),
  metodo: text("metodo"),
  // Legacy Autentique fields — kept for compatibility but no longer populated.
  autentiqueDocId: text("autentique_doc_id"),
  acaoUrl: text("acao_url"),
  signatarioNome: text("signatario_nome"),
  signatarioEmail: text("signatario_email"),
  signatarioCargo: text("signatario_cargo"),
  assinadoEm: timestamp("assinado_em", { withTimezone: true }),
  storagePath: text("storage_path"),
  enviadoEm: timestamp("enviado_em", { withTimezone: true }),
  // Self-hosted electronic signature fields (Lei 14.063/2020 — assinatura simples).
  signingToken: text("signing_token").unique(),
  signingTokenExpiresAt: timestamp("signing_token_expires_at", { withTimezone: true }),
  signerCpf: text("signer_cpf"),
  signerIp: text("signer_ip"),
  signerUserAgent: text("signer_user_agent"),
  docHash: text("doc_hash"),
  signedStoragePath: text("signed_storage_path"),
  templateVersion: integer("template_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LgpdTermo = typeof lgpdTermosTable.$inferSelect;
