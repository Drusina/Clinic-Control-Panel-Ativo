import { pgTable, text, uuid, integer, numeric, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";

export const diagnosticsTable = pgTable("diagnosticos", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  versao: integer("versao").default(1),
  status: text("status").notNull().default("em_andamento"),
  iniciadoEm: timestamp("iniciado_em", { withTimezone: true }).notNull().defaultNow(),
  concluidoEm: timestamp("concluido_em", { withTimezone: true }),
  scoreGlobal: numeric("score_global", { precision: 3, scale: 2 }),
  scoresPilares: jsonb("scores_pilares"),
  metasPilares: jsonb("metas_pilares"),
  insightsIa: jsonb("insights_ia"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDiagnosticSchema = createInsertSchema(diagnosticsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDiagnostic = z.infer<typeof insertDiagnosticSchema>;
export type Diagnostic = typeof diagnosticsTable.$inferSelect;
