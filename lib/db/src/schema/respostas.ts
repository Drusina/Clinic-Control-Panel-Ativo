import { pgTable, text, uuid, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { diagnosticsTable } from "./diagnostics";
import { perguntasTable } from "./perguntas";

export const respostasTable = pgTable(
  "respostas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    diagnosticoId: uuid("diagnostico_id")
      .notNull()
      .references(() => diagnosticsTable.id, { onDelete: "cascade" }),
    perguntaId: uuid("pergunta_id")
      .notNull()
      .references(() => perguntasTable.id, { onDelete: "cascade" }),
    valor: text("valor").notNull(),
    respondidoEm: timestamp("respondido_em", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("respostas_diagnostico_pergunta_unique").on(t.diagnosticoId, t.perguntaId)]
);

export const insertRespostaSchema = createInsertSchema(respostasTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertResposta = z.infer<typeof insertRespostaSchema>;
export type Resposta = typeof respostasTable.$inferSelect;
