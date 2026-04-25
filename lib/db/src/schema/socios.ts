import { pgTable, text, uuid, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";

export const sociosTable = pgTable("socios", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  cpf: text("cpf"),
  percentual: numeric("percentual", { precision: 5, scale: 2 }),
  cargo: text("cargo"),
  decisor: boolean("decisor").default(false),
  email: text("email"),
  whatsapp: text("whatsapp"),
  origem: text("origem").default("manual"),
  qualificacao: text("qualificacao"),
  qualId: text("qual_id"),
  dataEntrada: text("data_entrada"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSocioSchema = createInsertSchema(sociosTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSocio = z.infer<typeof insertSocioSchema>;
export type Socio = typeof sociosTable.$inferSelect;
