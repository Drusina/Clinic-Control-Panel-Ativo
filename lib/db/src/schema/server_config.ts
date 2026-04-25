import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const serverConfigTable = pgTable("server_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ServerConfig = typeof serverConfigTable.$inferSelect;
