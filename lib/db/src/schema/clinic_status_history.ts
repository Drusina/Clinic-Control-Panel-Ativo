import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";

export const clinicStatusHistoryTable = pgTable("clinic_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  motivo: text("motivo"),
  autorNome: text("autor_nome"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClinicStatusHistorySchema = createInsertSchema(clinicStatusHistoryTable).omit({
  id: true,
  createdAt: true,
});
export type InsertClinicStatusHistory = z.infer<typeof insertClinicStatusHistorySchema>;
export type ClinicStatusHistory = typeof clinicStatusHistoryTable.$inferSelect;
