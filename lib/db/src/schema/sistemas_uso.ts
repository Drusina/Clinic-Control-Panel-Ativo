import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";

export const sistemasUsoTable = pgTable("sistemas_uso", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  fornecedor: text("fornecedor"),
  tipo: text("tipo"),
  site: text("site"),
  apiDisponivel: text("api_disponivel"),
  responsavelInterno: text("responsavel_interno"),
  emailResponsavel: text("email_responsavel"),
  telefoneResponsavel: text("telefone_responsavel"),
  suporteExterno: text("suporte_externo"),
  criticidade: text("criticidade"),
  integrado: boolean("integrado").default(false),
  quemTemAcesso: text("quem_tem_acesso"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SistemaUso = typeof sistemasUsoTable.$inferSelect;
