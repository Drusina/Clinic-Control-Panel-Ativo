import { pgTable, text, uuid, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { actionsTable } from "./actions";

/**
 * Responsáveis de uma Ação (relação N:N por e-mail). Uma ação pode ter 1+
 * responsáveis, atribuídos na reunião de validação. Substitui o legado
 * `acoes.responsavel_nome` (mantido apenas como fallback de exibição).
 *
 * Unicidade case-insensitive por (acaoId, email) evita duplicar o mesmo
 * responsável. O índice por e-mail acelera a resolução de notificações.
 */
export const acaoResponsaveisTable = pgTable(
  "acao_responsaveis",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    acaoId: uuid("acao_id")
      .notNull()
      .references(() => actionsTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    nome: text("nome"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("acao_responsaveis_acao_email_uniq").on(t.acaoId, sql`lower(${t.email})`),
    index("acao_responsaveis_email_idx").on(t.email),
  ],
);

export const insertAcaoResponsavelSchema = createInsertSchema(acaoResponsaveisTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAcaoResponsavel = z.infer<typeof insertAcaoResponsavelSchema>;
export type AcaoResponsavel = typeof acaoResponsaveisTable.$inferSelect;
