import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";

export const sistemasUsoTable = pgTable("sistemas_uso", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  fornecedor: text("fornecedor"),
  tipo: text("tipo"),
  apiDisponivel: text("api_disponivel"),
  responsavelInterno: text("responsavel_interno"),
  criticidade: text("criticidade"),
  integrado: boolean("integrado").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SistemaUso = typeof sistemasUsoTable.$inferSelect;
