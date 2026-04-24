import { pgTable, text, uuid, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";

export const sociosTable = pgTable("socios", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  qualificacao: text("qualificacao"),
  qualId: text("qual_id"),
  dataEntrada: date("data_entrada"),
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
