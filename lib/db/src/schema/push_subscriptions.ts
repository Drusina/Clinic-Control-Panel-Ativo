import { pgTable, text, uuid, timestamp, jsonb } from "drizzle-orm/pg-core";
import { teamTable } from "./team";

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  clinicId: uuid("clinic_id"),
  teamMemberId: uuid("team_member_id").references(() => teamTable.id, { onDelete: "cascade" }),
  subscription: jsonb("subscription").notNull().$type<{
    endpoint: string;
    expirationTime: number | null;
    keys: { p256dh: string; auth: string };
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptionsTable.$inferInsert;
