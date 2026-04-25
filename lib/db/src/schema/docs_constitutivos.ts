import { pgTable, uuid, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";

export const docsConstitutivoTable = pgTable("docs_constitutivos", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  categoria: text("categoria").notNull(),
  nome: text("nome").notNull(),
  obrigatorio: boolean("obrigatorio").default(false),
  storagePath: text("storage_path"),
  tamanho: integer("tamanho"),
  enviadoEm: timestamp("enviado_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DocConstitutivo = typeof docsConstitutivoTable.$inferSelect;
