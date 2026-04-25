import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
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
  autentiqueDocId: text("autentique_doc_id"),
  acaoUrl: text("acao_url"),
  signatarioNome: text("signatario_nome"),
  signatarioEmail: text("signatario_email"),
  assinadoEm: timestamp("assinado_em", { withTimezone: true }),
  storagePath: text("storage_path"),
  enviadoEm: timestamp("enviado_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LgpdTermo = typeof lgpdTermosTable.$inferSelect;
