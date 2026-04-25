import { eq, and } from "drizzle-orm";
import { db, delegacoesTable, risksTable, actionsTable, icsPlanTemplatesTable } from "@workspace/db";

export const ICS_PILARES = [
  { slug: "estrategia", nome: "Estratégia e Governança", role: "CEO / Gestor Principal" },
  { slug: "financeiro", nome: "Financeiro e Fluxo de Caixa", role: "Gestor Financeiro" },
  { slug: "contabil", nome: "Contabilidade e Fiscal", role: "Contador Responsável" },
  { slug: "marketing", nome: "Vendas, Marketing e Captação", role: "Gestor de Marketing" },
  { slug: "operacoes", nome: "Processos Operacionais", role: "Coordenador Operacional" },
  { slug: "pessoas", nome: "Gestão de Pessoas e Cultura", role: "Gestor de Pessoas" },
  { slug: "tecnologia", nome: "Tecnologia e Sistemas", role: "Responsável de TI" },
];

export const ICS_RISKS = [
  {
    nome: "Inadimplência de pacientes",
    descricao: "Risco de alto volume de contas a receber sem liquidação, impactando o fluxo de caixa.",
    probabilidade: 4,
    impacto: 4,
    pilarSlug: "financeiro",
    acoesMitigadoras: "Implantar política de cobrança preventiva e parcelamentos controlados.",
  },
  {
    nome: "Falha no controle de fluxo de caixa",
    descricao: "Desconhecimento do saldo real disponível, levando a decisões financeiras equivocadas.",
    probabilidade: 3,
    impacto: 5,
    pilarSlug: "financeiro",
    acoesMitigadoras: "Adotar planilha ou sistema de fluxo de caixa com atualizações semanais.",
  },
  {
    nome: "Elevado índice de turnover da equipe",
    descricao: "Rotatividade acima da média gera custos de recontratação e perda de know-how.",
    probabilidade: 3,
    impacto: 4,
    pilarSlug: "pessoas",
    acoesMitigadoras: "Criar plano de cargos e salários e programa de reconhecimento interno.",
  },
  {
    nome: "Autuação fiscal ou tributária",
    descricao: "Erros no recolhimento de impostos ou obrigações acessórias podem gerar multas e passivos.",
    probabilidade: 2,
    impacto: 5,
    pilarSlug: "contabil",
    acoesMitigadoras: "Revisão mensal das obrigações fiscais com contador especializado.",
  },
  {
    nome: "Baixa captação de novos pacientes",
    descricao: "Insuficiência de estratégias de marketing digital reduz o volume de novos atendimentos.",
    probabilidade: 4,
    impacto: 3,
    pilarSlug: "marketing",
    acoesMitigadoras: "Definir funil de captação e investir em canais digitais com metas mensais.",
  },
  {
    nome: "Falha em sistemas de gestão",
    descricao: "Indisponibilidade de prontuário ou agendamento compromete a operação da clínica.",
    probabilidade: 2,
    impacto: 4,
    pilarSlug: "tecnologia",
    acoesMitigadoras: "Contratar suporte técnico e manter backup diário dos dados.",
  },
  {
    nome: "Não conformidade com a LGPD",
    descricao: "Tratamento inadequado de dados sensíveis de pacientes pode gerar sanções da ANPD.",
    probabilidade: 2,
    impacto: 5,
    pilarSlug: "compliance",
    acoesMitigadoras: "Elaborar política de privacidade e nomear um DPO interno.",
  },
  {
    nome: "Ausência de processos padronizados",
    descricao: "Falta de procedimentos operacionais escritos gera retrabalho e atendimento inconsistente.",
    probabilidade: 4,
    impacto: 3,
    pilarSlug: "operacoes",
    acoesMitigadoras: "Documentar os principais fluxos operacionais em POPs (Procedimentos Operacionais Padrão).",
  },
];

export const ICS_ACTIONS = [
  {
    titulo: "Mapear processos operacionais da clínica",
    descricao: "Identificar e documentar todos os fluxos operacionais existentes como base para padronização.",
    pilarSlug: "operacoes",
    prioridade: "alta",
    coluna: "backlog",
    ordem: 1,
  },
  {
    titulo: "Elaborar política de privacidade e proteção de dados (LGPD)",
    descricao: "Criar documento de política interna de tratamento de dados sensíveis de pacientes.",
    pilarSlug: "compliance",
    prioridade: "alta",
    coluna: "backlog",
    ordem: 2,
  },
  {
    titulo: "Definir metas mensais de captação de pacientes",
    descricao: "Estabelecer indicadores e metas de novos atendimentos para cada mês.",
    pilarSlug: "marketing",
    prioridade: "media",
    coluna: "backlog",
    ordem: 3,
  },
  {
    titulo: "Implantar controle de fluxo de caixa semanal",
    descricao: "Configurar planilha ou sistema para acompanhamento das entradas e saídas semanais.",
    pilarSlug: "financeiro",
    prioridade: "alta",
    coluna: "todo",
    ordem: 1,
  },
  {
    titulo: "Criar plano de cargos e salários",
    descricao: "Estruturar política de remuneração e progressão de carreira para a equipe.",
    pilarSlug: "pessoas",
    prioridade: "media",
    coluna: "todo",
    ordem: 2,
  },
  {
    titulo: "Configurar sistema de gestão da clínica",
    descricao: "Implementar e parametrizar o software de prontuário e agendamento.",
    pilarSlug: "tecnologia",
    prioridade: "alta",
    coluna: "doing",
    ordem: 1,
  },
  {
    titulo: "Estruturar reunião quinzenal de equipe",
    descricao: "Definir pauta-padrão e frequência das reuniões de alinhamento interno.",
    pilarSlug: "pessoas",
    prioridade: "media",
    coluna: "doing",
    ordem: 2,
  },
  {
    titulo: "Revisar contratos com fornecedores",
    descricao: "Analisar termos contratuais e identificar oportunidades de renegociação.",
    pilarSlug: "contabil",
    prioridade: "media",
    coluna: "review",
    ordem: 1,
  },
  {
    titulo: "Realizar diagnóstico inicial ICS",
    descricao: "Aplicar questionário de diagnóstico ICS para mapeamento dos pilares da clínica.",
    pilarSlug: "estrategia",
    prioridade: "alta",
    coluna: "done",
    ordem: 1,
  },
];

function parseJsonField<T>(raw: string | null | undefined, fallback: T[]): T[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export async function getTemplateForPlan(plan: string | null | undefined): Promise<{
  pilares: typeof ICS_PILARES;
  risks: typeof ICS_RISKS;
  actions: typeof ICS_ACTIONS;
}> {
  if (!plan) {
    return { pilares: ICS_PILARES, risks: ICS_RISKS, actions: ICS_ACTIONS };
  }

  const [row] = await db
    .select()
    .from(icsPlanTemplatesTable)
    .where(eq(icsPlanTemplatesTable.plan, plan));

  return {
    pilares: parseJsonField(row?.pilares, ICS_PILARES) as typeof ICS_PILARES,
    risks: parseJsonField(row?.risks, ICS_RISKS) as typeof ICS_RISKS,
    actions: parseJsonField(row?.actions, ICS_ACTIONS) as typeof ICS_ACTIONS,
  };
}

export async function seedIcsData(clinicId: string, plan?: string | null): Promise<{
  delegacoes: number;
  risks: number;
  actions: number;
}> {
  const template = await getTemplateForPlan(plan);

  const [existingDelegacoes, existingRisks, existingActions] = await Promise.all([
    db
      .select()
      .from(delegacoesTable)
      .where(and(eq(delegacoesTable.clinicId, clinicId), eq(delegacoesTable.nivel, 1))),
    db.select({ nome: risksTable.nome }).from(risksTable).where(eq(risksTable.clinicId, clinicId)),
    db.select({ titulo: actionsTable.titulo }).from(actionsTable).where(eq(actionsTable.clinicId, clinicId)),
  ]);

  const existingSlugs = new Set(existingDelegacoes.map((d) => d.pilarSlug));
  const existingRiskNames = new Set(existingRisks.map((r) => r.nome));
  const existingActionTitles = new Set(existingActions.map((a) => a.titulo));

  const pilaresToCreate = template.pilares.filter((p) => !existingSlugs.has(p.slug));
  const risksToCreate = template.risks.filter((r) => !existingRiskNames.has(r.nome));
  const actionsToCreate = template.actions.filter((a) => !existingActionTitles.has(a.titulo));

  const now = new Date();

  const [createdDelegacoes, createdRisks, createdActions] = await Promise.all([
    pilaresToCreate.length > 0
      ? db
          .insert(delegacoesTable)
          .values(
            pilaresToCreate.map((p) => ({
              clinicId,
              pilarSlug: p.slug,
              pilarNome: p.nome,
              nivel: 1,
              responsavelNome: p.role,
              responsavelEmail: null,
              prazo: null,
              status: "pendente" as const,
              questaoInicio: null,
              questaoFim: null,
              parentId: null,
              observacoes: null,
            }))
          )
          .returning()
      : Promise.resolve([]),
    risksToCreate.length > 0
      ? db
          .insert(risksTable)
          .values(
            risksToCreate.map((r) => ({
              clinicId,
              nome: r.nome,
              descricao: r.descricao,
              probabilidade: r.probabilidade,
              impacto: r.impacto,
              severidade: r.probabilidade * r.impacto,
              pilarSlug: r.pilarSlug,
              responsavel: null,
              acoesMitigadoras: r.acoesMitigadoras,
              status: "identificado" as const,
            }))
          )
          .returning()
      : Promise.resolve([]),
    actionsToCreate.length > 0
      ? db
          .insert(actionsTable)
          .values(
            actionsToCreate.map((a) => ({
              clinicId,
              titulo: a.titulo,
              descricao: a.descricao,
              pilarSlug: a.pilarSlug,
              prioridade: a.prioridade,
              coluna: a.coluna,
              ordem: a.ordem,
              responsavelNome: null,
              prazo: null,
              evidencias: null,
              concluidoEm: a.coluna === "done" ? now : null,
            }))
          )
          .returning()
      : Promise.resolve([]),
  ]);

  return {
    delegacoes: createdDelegacoes.length,
    risks: createdRisks.length,
    actions: createdActions.length,
  };
}
