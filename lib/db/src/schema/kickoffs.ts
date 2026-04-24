import { pgTable, text, uuid, integer, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";

export const kickoffsTable = pgTable("kickoffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .unique()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  dataRealizacao: date("data_realizacao"),
  modalidade: text("modalidade"),
  duracaoMinutos: integer("duracao_minutos"),
  facilitador: text("facilitador"),
  status: text("status").notNull().default("rascunho"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertKickoffSchema = createInsertSchema(kickoffsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertKickoff = z.infer<typeof insertKickoffSchema>;
export type Kickoff = typeof kickoffsTable.$inferSelect;
