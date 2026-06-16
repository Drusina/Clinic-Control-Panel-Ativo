import {
  pgTable,
  text,
  uuid,
  integer,
  date,
  jsonb,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";

/**
 * Snapshot of the automatic suggestion captured at the moment a human
 * confirmed/blocked/reopened the stage — audit context for "what the system
 * was suggesting when this decision was made". The live suggestion is computed
 * on read and is never persisted during GET.
 */
export type TrilhaSugestaoSnapshot = {
  pronto: boolean;
  motivo: string;
  computedAt: string;
};

/**
 * Per-clinic lifecycle state for each stage of the fixed 15-stage trilha. The
 * stage catalog itself (keys, labels, order, target module) lives in the
 * zero-dependency `@workspace/trilha` lib; this table only holds the mutable
 * per-clinic state. Rows are materialized lazily (one per clinic per stage)
 * and uniquely keyed by `(clinic_id, etapa_key)`.
 */
export const trilhaEtapasTable = pgTable(
  "trilha_etapas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinicsTable.id, { onDelete: "cascade" }),
    etapaKey: text("etapa_key").notNull(),
    ordem: integer("ordem").notNull(),
    // pendente | em_andamento | concluido | bloqueado | nao_aplicavel
    status: text("status").notNull().default("pendente"),
    responsavel: text("responsavel"),
    dataPrevista: date("data_prevista", { mode: "string" }),
    dataConcluida: timestamp("data_concluida", { withTimezone: true }),
    observacao: text("observacao"),
    sugestaoSnapshot: jsonb("sugestao_snapshot").$type<TrilhaSugestaoSnapshot>(),
    confirmadoPor: text("confirmado_por"),
    confirmadoEm: timestamp("confirmado_em", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("trilha_etapas_clinic_key_uq").on(t.clinicId, t.etapaKey)],
);

export const insertTrilhaEtapaSchema = createInsertSchema(trilhaEtapasTable).omit(
  {
    id: true,
    createdAt: true,
    updatedAt: true,
  },
);
export type InsertTrilhaEtapa = z.infer<typeof insertTrilhaEtapaSchema>;
export type TrilhaEtapa = typeof trilhaEtapasTable.$inferSelect;
