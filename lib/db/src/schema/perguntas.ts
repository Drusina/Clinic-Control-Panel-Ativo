import { pgTable, text, uuid, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const perguntasTable = pgTable("perguntas", {
  id: uuid("id").primaryKey().defaultRandom(),
  pilarSlug: text("pilar_slug").notNull(),
  pilarNome: text("pilar_nome").notNull(),
  pilarOrdem: integer("pilar_ordem").notNull(),
  texto: text("texto").notNull(),
  tipo: text("tipo").notNull(),
  peso: numeric("peso", { precision: 3, scale: 2 }).notNull().default("1.00"),
  ordem: integer("ordem").notNull(),
  dica: text("dica"),
  valorMin: numeric("valor_min", { precision: 10, scale: 2 }),
  valorMax: numeric("valor_max", { precision: 10, scale: 2 }),
  inverso: boolean("inverso").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPerguntaSchema = createInsertSchema(perguntasTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPergunta = z.infer<typeof insertPerguntaSchema>;
export type Pergunta = typeof perguntasTable.$inferSelect;
