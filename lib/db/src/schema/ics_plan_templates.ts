import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const icsPlanTemplatesTable = pgTable("ics_plan_templates", {
  plan: text("plan").primaryKey(),
  risks: text("risks"),
  actions: text("actions"),
  pilares: text("pilares"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type IcsPlanTemplate = typeof icsPlanTemplatesTable.$inferSelect;
