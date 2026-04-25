import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";

export const parceirosExternosTable = pgTable("parceiros_externos", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  nomeEmpresa: text("nome_empresa"),
  responsavel: text("responsavel"),
  registroProfissional: text("registro_profissional"),
  telefone: text("telefone"),
  email: text("email"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ParceirosExterno = typeof parceirosExternosTable.$inferSelect;
