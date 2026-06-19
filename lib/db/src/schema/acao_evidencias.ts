import { pgTable, uuid, timestamp, unique } from "drizzle-orm/pg-core";
import { actionsTable } from "./actions";
import { evidenciasTable } from "./evidencias";

export const acaoEvidenciasTable = pgTable(
  "acao_evidencias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    acaoId: uuid("acao_id")
      .notNull()
      .references(() => actionsTable.id, { onDelete: "cascade" }),
    evidenciaId: uuid("evidencia_id")
      .notNull()
      .references(() => evidenciasTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("acao_evidencia_unique").on(t.acaoId, t.evidenciaId)],
);

export type AcaoEvidencia = typeof acaoEvidenciasTable.$inferSelect;
export type InsertAcaoEvidencia = typeof acaoEvidenciasTable.$inferInsert;
