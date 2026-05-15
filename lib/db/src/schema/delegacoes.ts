import { pgTable, text, uuid, date, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";

export const delegacoesTable = pgTable("delegacoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  pilarSlug: text("pilar_slug").notNull(),
  pilarNome: text("pilar_nome").notNull(),
  nivel: integer("nivel").notNull().default(1),
  responsavelNome: text("responsavel_nome"),
  responsavelEmail: text("responsavel_email"),
  prazo: date("prazo"),
  status: text("status").notNull().default("nao_delegado"),
  questaoInicio: integer("questao_inicio"),
  questaoFim: integer("questao_fim"),
  parentId: uuid("parent_id"),
  observacoes: text("observacoes"),
  // Invite token (link individual por pilar) — task #205
  inviteCodeHash: text("invite_code_hash"),
  inviteCodeExpiresAt: timestamp("invite_code_expires_at", { withTimezone: true }),
  inviteRedeemedAt: timestamp("invite_redeemed_at", { withTimezone: true }),
  inviteSentAt: timestamp("invite_sent_at", { withTimezone: true }),
  // Diagnostic the invite is bound to. Old invites do NOT redeem into newer
  // diagnostic cycles — the manager must explicitly re-send.
  inviteDiagnosticoId: uuid("invite_diagnostico_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  inviteHashIdx: index("delegacoes_invite_code_hash_idx").on(t.inviteCodeHash),
}));

export const insertDelegacaoSchema = createInsertSchema(delegacoesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDelegacao = z.infer<typeof insertDelegacaoSchema>;
export type Delegacao = typeof delegacoesTable.$inferSelect;
