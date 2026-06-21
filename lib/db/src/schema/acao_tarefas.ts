import {
  pgTable,
  text,
  uuid,
  integer,
  date,
  timestamp,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { actionsTable } from "./actions";

/**
 * Tarefas que decompõem uma Ação do Plano de Ação (Fase 3).
 *
 * Hierarquia atual: Plano de Ação → Ação (`acoes`) → Tarefa (`acao_tarefas`).
 * Uma tarefa pode ter subtarefas via `parentTarefaId` (auto-referência).
 *
 * O progresso da ação é derivado das tarefas de topo (parentTarefaId IS NULL).
 *
 * Prontidão para "Projeto": como as tarefas pendem da ação (e não o contrário),
 * uma futura camada "Projeto" acima da Ação é aditiva e não-disruptiva — basta
 * adicionar uma coluna `projeto_id` nullable em `acoes` mais tarde, sem refatorar
 * tarefas. Por isso NÃO criamos uma coluna especulativa agora.
 */
export const acaoTarefasTable = pgTable(
  "acao_tarefas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    acaoId: uuid("acao_id")
      .notNull()
      .references(() => actionsTable.id, { onDelete: "cascade" }),
    // Subtarefa: aponta para a tarefa-mãe na mesma tabela. Top-level = NULL.
    parentTarefaId: uuid("parent_tarefa_id").references(
      (): AnyPgColumn => acaoTarefasTable.id,
      { onDelete: "cascade" },
    ),
    titulo: text("titulo").notNull(),
    descricao: text("descricao"),
    responsavelNome: text("responsavel_nome"),
    // E-mail do responsável (escolhido entre os usuários da clínica). Guardado
    // diretamente para resolver notificações sem depender de match por nome.
    responsavelEmail: text("responsavel_email"),
    dataInicio: date("data_inicio", { mode: "string" }),
    prazo: date("prazo", { mode: "string" }),
    // a_fazer | fazendo | concluida
    status: text("status").notNull().default("a_fazer"),
    ordem: integer("ordem").notNull().default(0),
    concluidaEm: timestamp("concluida_em", { withTimezone: true }),
    // Dedup de lembrete de prazo (claim atômico no job diário).
    lembretePrazoEnviadoEm: timestamp("lembrete_prazo_enviado_em", {
      withTimezone: true,
    }),
    // Link idempotente para o item de checklist que originou esta tarefa na
    // migração (backfill). NULL para tarefas criadas diretamente.
    origemChecklistId: uuid("origem_checklist_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("acao_tarefas_acao_parent_ordem_idx").on(
      t.acaoId,
      t.parentTarefaId,
      t.ordem,
    ),
    index("acao_tarefas_responsavel_prazo_idx").on(
      t.responsavelEmail,
      t.prazo,
      t.status,
    ),
    index("acao_tarefas_deadline_idx").on(
      t.prazo,
      t.status,
      t.lembretePrazoEnviadoEm,
    ),
    uniqueIndex("acao_tarefas_origem_checklist_uniq")
      .on(t.origemChecklistId)
      .where(sql`${t.origemChecklistId} IS NOT NULL`),
  ],
);

export const insertAcaoTarefaSchema = createInsertSchema(acaoTarefasTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAcaoTarefa = z.infer<typeof insertAcaoTarefaSchema>;
export type AcaoTarefa = typeof acaoTarefasTable.$inferSelect;
