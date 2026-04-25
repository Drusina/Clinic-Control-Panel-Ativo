import { pgTable, text, uuid, date, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";

export const delegacoesTable = pgTable("delegacoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  pilarSlug: text("pilar_slug").notNull(),
  pilarNome: text("pilar_nome").notNull(),
  nivel: integer("nivel").notNull().default(1),
  responsavelNome: text("responsavel_nome"),
  responsavelEmail: text("responsavel_email"),
  prazo: date("prazo"),
  status: text("status").notNull().default("nao_delegado"),
  questaoInicio: integer("questao_inicio"),
  questaoFim: integer("questao_fim"),
  parentId: uuid("parent_id"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDelegacaoSchema = createInsertSchema(delegacoesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDelegacao = z.infer<typeof insertDelegacaoSchema>;
export type Delegacao = typeof delegacoesTable.$inferSelect;
