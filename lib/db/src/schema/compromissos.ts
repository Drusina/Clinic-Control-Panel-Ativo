import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";
import { actionsTable } from "./actions";

/**
 * Per-clinic agenda. Each row is a single appointment (reunião / tarefa /
 * marco). Optionally links to a fixed Trilha stage (`etapaKey`, validated at
 * the API layer against @workspace/trilha) and/or an action-plan card
 * (`acaoId`). Reminders are dispatched by the `compromisso-reminder` pg-boss
 * worker: `lembreteMinutosAntes` is the offset before `inicio`, and
 * `lembreteEnviadoEm` is the dedup stamp (set atomically when claimed).
 *
 * Agenda is intentionally decoupled from Trilha progress — it never mutates
 * `clinics.etapa`/`progresso` nor `trilha_etapas`.
 */
export const compromissosTable = pgTable(
  "compromissos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinicsTable.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull().default("reuniao"), // reuniao | tarefa | marco
    titulo: text("titulo").notNull(),
    descricao: text("descricao"),
    inicio: timestamp("inicio", { withTimezone: true }).notNull(),
    fim: timestamp("fim", { withTimezone: true }),
    diaInteiro: boolean("dia_inteiro").notNull().default(false),
    responsavelNome: text("responsavel_nome"),
    responsavelEmail: text("responsavel_email"),
    local: text("local"),
    status: text("status").notNull().default("agendado"), // agendado | concluido | cancelado
    etapaKey: text("etapa_key"),
    acaoId: uuid("acao_id").references(() => actionsTable.id, {
      onDelete: "set null",
    }),
    lembreteMinutosAntes: integer("lembrete_minutos_antes"),
    lembreteEnviadoEm: timestamp("lembrete_enviado_em", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("compromissos_clinic_inicio_idx").on(t.clinicId, t.inicio),
    index("compromissos_clinic_status_idx").on(t.clinicId, t.status),
    index("compromissos_etapa_idx").on(t.etapaKey),
    index("compromissos_acao_idx").on(t.acaoId),
    index("compromissos_reminder_idx").on(t.status, t.lembreteEnviadoEm),
  ],
);

export const insertCompromissoSchema = createInsertSchema(compromissosTable).omit(
  {
    id: true,
    createdAt: true,
    updatedAt: true,
  },
);
export type InsertCompromisso = z.infer<typeof insertCompromissoSchema>;
export type Compromisso = typeof compromissosTable.$inferSelect;
