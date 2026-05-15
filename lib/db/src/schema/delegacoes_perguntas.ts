import { pgTable, uuid, primaryKey, index } from "drizzle-orm/pg-core";
import { delegacoesTable } from "./delegacoes";
import { perguntasTable } from "./perguntas";

export const delegacoesPerguntasTable = pgTable(
  "delegacoes_perguntas",
  {
    delegacaoId: uuid("delegacao_id")
      .notNull()
      .references(() => delegacoesTable.id, { onDelete: "cascade" }),
    perguntaId: uuid("pergunta_id")
      .notNull()
      .references(() => perguntasTable.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.delegacaoId, t.perguntaId] }),
    perguntaIdx: index("delegacoes_perguntas_pergunta_idx").on(t.perguntaId),
  }),
);

export type DelegacaoPergunta = typeof delegacoesPerguntasTable.$inferSelect;
