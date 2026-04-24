import { pgTable, text, uuid, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";

export const faturasTable = pgTable("faturas", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  numero: text("numero").notNull(),
  vencimento: date("vencimento").notNull(),
  valor: numeric("valor", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("pendente"),
  pagoEm: date("pago_em"),
  formaPagamento: text("forma_pagamento"),
  observacao: text("observacao"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFaturaSchema = createInsertSchema(faturasTable).omit({
  id: true,
  createdAt: true,
});
export type InsertFatura = z.infer<typeof insertFaturaSchema>;
export type Fatura = typeof faturasTable.$inferSelect;
