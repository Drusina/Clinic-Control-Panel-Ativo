import { pgTable, text, uuid, integer, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";
import { risksTable } from "./risks";

export const actionsTable = pgTable("acoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  responsavelNome: text("responsavel_nome"),
  prazo: date("prazo"),
  prioridade: text("prioridade"),
  pilarSlug: text("pilar_slug"),
  evidencias: text("evidencias"),
  coluna: text("coluna").notNull().default("backlog"),
  ordem: integer("ordem").notNull().default(0),
  riscoOrigemId: uuid("risco_origem_id").references(() => risksTable.id, {
    onDelete: "set null",
  }),
  concluidoEm: timestamp("concluido_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertActionSchema = createInsertSchema(actionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAction = z.infer<typeof insertActionSchema>;
export type Action = typeof actionsTable.$inferSelect;
