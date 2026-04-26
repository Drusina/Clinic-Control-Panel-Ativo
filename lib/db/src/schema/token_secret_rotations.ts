import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";

export const tokenSecretRotationsTable = pgTable("token_secret_rotations", {
  id: uuid("id").primaryKey().defaultRandom(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }).notNull().defaultNow(),
  actorRole: text("actor_role"),
  actorEmail: text("actor_email"),
  actorSub: text("actor_sub"),
});

export type TokenSecretRotation = typeof tokenSecretRotationsTable.$inferSelect;
