import { pgTable, text, uuid, integer, timestamp, date } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";

export const documentosTable = pgTable("documentos", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  categoria: text("categoria").notNull(),
  storagePath: text("storage_path"),
  tamanho: integer("tamanho"),
  mimeType: text("mime_type"),
  validade: date("validade"),
  status: text("status").notNull().default("pendente"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Documento = typeof documentosTable.$inferSelect;
export type InsertDocumento = typeof documentosTable.$inferInsert;
