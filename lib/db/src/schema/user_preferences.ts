import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const userPreferencesTable = pgTable("preferencias_usuario", {
  userKey: text("user_key").primaryKey(),
  prefs: jsonb("prefs").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserPreferences = typeof userPreferencesTable.$inferSelect;
