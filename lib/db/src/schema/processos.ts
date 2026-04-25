import { pgTable, text, uuid, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";

export const processosTable = pgTable("processos", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  status: text("status").notNull().default("pendente"),
  responsavel: text("responsavel"),
  duracaoMedia: text("duracao_media"),
  gargalos: text("gargalos"),
  pilarSlug: text("pilar_slug"),
  flowNodes: jsonb("flow_nodes"),
  flowEdges: jsonb("flow_edges"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Processo = typeof processosTable.$inferSelect;
export type InsertProcesso = typeof processosTable.$inferInsert;
