import {
  pgTable,
  text,
  uuid,
  integer,
  numeric,
  date,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clinicsTable = pgTable("clinics", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  fantasia: text("fantasia"),
  cnpj: text("cnpj").notNull().unique(),
  razaoSocial: text("razao_social"),
  cidade: text("cidade"),
  uf: text("uf"),
  cep: text("cep"),
  endereco: text("endereco"),
  responsavel: text("responsavel"),
  email: text("email"),
  whatsapp: text("whatsapp"),
  cargo: text("cargo"),
  plano: text("plano").notNull().default("starter"),
  status: text("status").notNull().default("prospect"),
  suspensoMotivo: text("suspenso_motivo"),
  etapa: integer("etapa").notNull().default(1),
  progresso: integer("progresso").default(0),
  valorImplantacao: numeric("valor_implantacao", { precision: 12, scale: 2 }),
  valorRecorrente: numeric("valor_recorrente", { precision: 12, scale: 2 }),
  formaPagamento: text("forma_pagamento"),
  diaVencimento: integer("dia_vencimento"),
  reajusteIndice: text("reajuste_indice").default("IGPM/FGV"),
  inicioRecorrencia: date("inicio_recorrencia"),
  cnae: text("cnae"),
  situacaoCadastral: text("situacao_cadastral"),
  capitalSocial: numeric("capital_social", { precision: 14, scale: 2 }),
  dataAbertura: text("data_abertura"),
  propostaUrl: text("proposta_url"),
  contratoUrl: text("contrato_url"),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClinicSchema = createInsertSchema(clinicsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertClinic = z.infer<typeof insertClinicSchema>;
export type Clinic = typeof clinicsTable.$inferSelect;
