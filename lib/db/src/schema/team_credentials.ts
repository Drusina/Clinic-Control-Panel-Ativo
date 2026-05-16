import { pgTable, text, uuid, boolean, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * Per-identity (email) credentials for team_member sessions.
 *
 * Decoupled from `equipe_interna` on purpose: the same e-mail can be added
 * to several clinics (each clinic gets its own row in `equipe_interna`) but
 * the user only has ONE senha. Keyed by `lower(email)` so we never collide
 * on casing.
 */
export const teamCredentialsTable = pgTable("team_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  emailNormalized: text("email_normalized").notNull().unique(),
  senhaHash: text("senha_hash").notNull(),
  senhaProvisoria: boolean("senha_provisoria").notNull().default(true),
  senhaAlteradaEm: timestamp("senha_alterada_em", { withTimezone: true }),
  resetTokenHash: text("reset_token_hash"),
  resetTokenExpiresAt: timestamp("reset_token_expires_at", { withTimezone: true }),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TeamCredential = typeof teamCredentialsTable.$inferSelect;
export type InsertTeamCredential = typeof teamCredentialsTable.$inferInsert;
