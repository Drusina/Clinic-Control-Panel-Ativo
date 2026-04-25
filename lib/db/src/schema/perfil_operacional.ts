import { pgTable, uuid, numeric, integer, text, timestamp } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";

export const perfilOperacionalTable = pgTable("perfil_operacional", {
  clinicId: uuid("clinic_id")
    .primaryKey()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  faturamentoMensal: numeric("faturamento_mensal", { precision: 14, scale: 2 }),
  ticketMedio: numeric("ticket_medio", { precision: 10, scale: 2 }),
  pacientesAtivos: integer("pacientes_ativos"),
  atendimentosMes: integer("atendimentos_mes"),
  especialidades: text("especialidades").array(),
  horarioFuncionamento: text("horario_funcionamento"),
  modeloParticular: integer("modelo_particular").default(0),
  modeloConvenio: integer("modelo_convenio").default(0),
  modeloSus: integer("modelo_sus").default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PerfilOperacional = typeof perfilOperacionalTable.$inferSelect;
