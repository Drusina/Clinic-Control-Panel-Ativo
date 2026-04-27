import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { lgpdTermosTable } from "./lgpd_termos";

/**
 * Append-only audit log of every electronic-signature request issued for a
 * given LGPD term. One row per "Solicitar assinatura" / "Reemitir" action.
 * On signature submission the originating row is updated in place with
 * signer evidence (status='assinado', signed_storage_path, signer_*,
 * verification_code, signed_at). Earlier reissued rows keep status='reissued'
 * so reviewers can reconstruct the full history of each termo.
 *
 * `lgpd_termos` continues to hold the latest current state for the LGPD tab
 * UI; this table holds the immutable per-request audit trail required by
 * the operator (Lei 14.063/2020 best practice for assinatura simples).
 */
export const lgpdSignatureRequestsTable = pgTable("lgpd_signature_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  termoId: uuid("termo_id")
    .notNull()
    .references(() => lgpdTermosTable.id, { onDelete: "cascade" }),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),

  signingToken: text("signing_token").notNull().unique(),
  signingTokenExpiresAt: timestamp("signing_token_expires_at", { withTimezone: true }).notNull(),

  signatarioNome: text("signatario_nome").notNull(),
  signatarioEmail: text("signatario_email").notNull(),
  signatarioCargo: text("signatario_cargo"),

  storagePath: text("storage_path").notNull(),
  docHash: text("doc_hash").notNull(),
  templateVersion: integer("template_version").notNull(),

  // enviado | assinado | reissued | expirado
  status: text("status").notNull().default("enviado"),

  signerCpf: text("signer_cpf"),
  signerIp: text("signer_ip"),
  signerUserAgent: text("signer_user_agent"),
  signedStoragePath: text("signed_storage_path"),
  verificationCode: text("verification_code"),

  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  reissuedAt: timestamp("reissued_at", { withTimezone: true }),
});

export type LgpdSignatureRequest = typeof lgpdSignatureRequestsTable.$inferSelect;
