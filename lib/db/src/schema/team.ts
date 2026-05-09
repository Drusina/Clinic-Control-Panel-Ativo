import { pgTable, text, uuid, boolean, timestamp, jsonb, date, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  tipoJornada: text("tipo_jornada"),
  email: text("email"),
  whatsapp: text("whatsapp"),
  cpf: text("cpf"),
  dataAdmissao: date("data_admissao"),
  respondeA: text("responde_a"),
  observacoes: text("observacoes"),
  temAcessoPlataforma: boolean("tem_acesso_plataforma").default(false),
  inviteStatus: text("invite_status"),
  inviteCodeHash: text("invite_code_hash"),
  inviteCodeExpiresAt: timestamp("invite_code_expires_at", { withTimezone: true }),
  inviteRedeemedAt: timestamp("invite_redeemed_at", { withTimezone: true }),
  lastAccessAt: timestamp("last_access_at", { withTimezone: true }),
  notificationPreferences: jsonb("notification_preferences").$type<{
    emailEnabled: boolean;
    whatsappEnabled: boolean;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  cpfPerClinicUnique: uniqueIndex("equipe_interna_clinic_cpf_uniq")
    .on(t.clinicId, t.cpf)
    .where(sql`${t.cpf} IS NOT NULL`),
}));

export const insertTeamMemberSchema = createInsertSchema(teamTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamTable.$inferSelect;
