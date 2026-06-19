import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { actionsTable } from "./actions";

export const acaoNotasTable = pgTable("acao_notas", {
  id: uuid("id").primaryKey().defaultRandom(),
  acaoId: uuid("acao_id")
    .notNull()
    .references(() => actionsTable.id, { onDelete: "cascade" }),
  autor: text("autor"),
  texto: text("texto").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AcaoNota = typeof acaoNotasTable.$inferSelect;
export type InsertAcaoNota = typeof acaoNotasTable.$inferInsert;
