import { pgTable, text, uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";

export const evidenciasTable = pgTable("evidencias", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  pilarSlug: text("pilar_slug").notNull(),
  nome: text("nome").notNull(),
  tipo: text("tipo"),
  descricao: text("descricao"),
  responsavel: text("responsavel"),
  storagePath: text("storage_path"),
  tamanho: integer("tamanho"),
  mimeType: text("mime_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Evidencia = typeof evidenciasTable.$inferSelect;
export type InsertEvidencia = typeof evidenciasTable.$inferInsert;
