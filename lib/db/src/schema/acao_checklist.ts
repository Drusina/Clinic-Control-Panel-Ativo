import { pgTable, text, uuid, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { actionsTable } from "./actions";

export const acaoChecklistItensTable = pgTable("acao_checklist_itens", {
  id: uuid("id").primaryKey().defaultRandom(),
  acaoId: uuid("acao_id")
    .notNull()
    .references(() => actionsTable.id, { onDelete: "cascade" }),
  texto: text("texto").notNull(),
  feito: boolean("feito").notNull().default(false),
  ordem: integer("ordem").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AcaoChecklistItem = typeof acaoChecklistItensTable.$inferSelect;
export type InsertAcaoChecklistItem = typeof acaoChecklistItensTable.$inferInsert;
