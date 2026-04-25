import { pgTable, text, uuid, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";

export const teamTable = pgTable("equipe_interna", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  funcao: text("funcao"),
  area: text("area"),
  vinculo: text("vinculo"),
  email: text("email"),
  whatsapp: text("whatsapp"),
  temAcessoPlataforma: boolean("tem_acesso_plataforma").default(false),
  inviteStatus: text("invite_status"),
  lastAccessAt: timestamp("last_access_at", { withTimezone: true }),
  notificationPreferences: jsonb("notification_preferences").$type<{
    emailEnabled: boolean;
    whatsappEnabled: boolean;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTeamMemberSchema = createInsertSchema(teamTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamTable.$inferSelect;
