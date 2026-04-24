import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";

export const clinicActivityTable = pgTable("clinic_activity", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  autorNome: text("autor_nome"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClinicActivitySchema = createInsertSchema(clinicActivityTable).omit({
  id: true,
  createdAt: true,
});
export type InsertClinicActivity = z.infer<typeof insertClinicActivitySchema>;
export type ClinicActivity = typeof clinicActivityTable.$inferSelect;
