import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const cnpjCacheTable = pgTable("cnpj_cache", {
  cnpj: text("cnpj").primaryKey(),
  data: jsonb("data").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CnpjCache = typeof cnpjCacheTable.$inferSelect;
