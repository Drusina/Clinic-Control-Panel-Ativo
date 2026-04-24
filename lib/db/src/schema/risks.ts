import { pgTable, text, uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";

export const risksTable = pgTable("riscos", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  probabilidade: integer("probabilidade").notNull(),
  impacto: integer("impacto").notNull(),
  severidade: integer("severidade").notNull(),
  responsavel: text("responsavel"),
  acoesMitigadoras: text("acoes_mitigadoras"),
  status: text("status").notNull().default("identificado"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRiskSchema = createInsertSchema(risksTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRisk = z.infer<typeof insertRiskSchema>;
export type Risk = typeof risksTable.$inferSelect;
