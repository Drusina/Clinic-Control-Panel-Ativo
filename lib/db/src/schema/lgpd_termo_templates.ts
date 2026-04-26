import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const lgpdTermoTemplatesTable = pgTable("lgpd_termo_templates", {
  slug: text("slug").primaryKey(),
  titulo: text("titulo").notNull(),
  descricao: text("descricao").notNull(),
  corpo: text("corpo").notNull(),
  versao: integer("versao").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LgpdTermoTemplate = typeof lgpdTermoTemplatesTable.$inferSelect;
