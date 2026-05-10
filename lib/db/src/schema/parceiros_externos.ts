import { pgTable, uuid, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { clinicsTable } from "./clinics";

export const parceirosExternosTable = pgTable(
  "parceiros_externos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinicsTable.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    nomeEmpresa: text("nome_empresa"),
    responsavel: text("responsavel"),
    registroProfissional: text("registro_profissional"),
    telefone: text("telefone"),
    email: text("email"),
    observacoes: text("observacoes"),
    // Task #167 — Rede Externa fields
    cnpjCpf: text("cnpj_cpf"),
    site: text("site"),
    temContratoFormal: boolean("tem_contrato_formal"),
    ondeContrato: text("onde_contrato"),
    frequenciaContato: text("frequencia_contato"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Partial unique index for upsert key. cnpjCpf is stored as digits-only at
    // write time so equality comparison is unambiguous. Allows multiple rows
    // with NULL cnpjCpf (fallback match by nome+responsavel handled in app code).
    cnpjCpfUniq: uniqueIndex("parceiros_externos_clinic_cnpj_cpf_uniq")
      .on(t.clinicId, t.cnpjCpf)
      .where(sql`cnpj_cpf IS NOT NULL`),
  }),
);

export type ParceirosExterno = typeof parceirosExternosTable.$inferSelect;
