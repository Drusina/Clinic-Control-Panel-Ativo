import { eq, and, inArray, isNull } from "drizzle-orm";
import {
  db,
  delegacoesTable,
  risksTable,
  actionsTable,
  icsPlanTemplatesTable,
  acaoTarefasTable,
} from "@workspace/db";
import { createSuggestedTarefas } from "./tarefas.js";

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

/**
 * Modelo curado de uma ação ICS. `tarefas` são títulos de tarefas sugeridas
 * (somente títulos; sem responsável/datas/status) criadas junto com a ação no
 * seed. É opcional para que templates customizados (salvos em
 * `ics_plan_templates.actions`) que ainda não tenham tarefas continuem válidos.
 */
export interface IcsActionTemplate {
  titulo: string;
  descricao: string;
  pilarSlug: string;
  prioridade: string;
  coluna: string;
  ordem: number;
  tarefas?: string[];
}

export const ICS_ACTIONS: IcsActionTemplate[] = [
  {
    titulo: "Mapear processos operacionais da clínica",
    descricao: "Identificar e documentar todos os fluxos operacionais existentes como base para padronização.",
    pilarSlug: "operacoes",
    prioridade: "alta",
    coluna: "backlog",
    ordem: 1,
    tarefas: [
      "Listar os processos de cada setor",
      "Entrevistar os responsáveis de cada área",
      "Desenhar o fluxograma de cada processo",
      "Validar o mapeamento com a equipe",
    ],
  },
  {
    titulo: "Elaborar política de privacidade e proteção de dados (LGPD)",
    descricao: "Criar documento de política interna de tratamento de dados sensíveis de pacientes.",
    pilarSlug: "compliance",
    prioridade: "alta",
    coluna: "backlog",
    ordem: 2,
    tarefas: [
      "Levantar os dados pessoais tratados pela clínica",
      "Definir a base legal de cada tratamento",
      "Redigir a política de privacidade",
      "Nomear o encarregado (DPO)",
      "Publicar e comunicar a política à equipe",
    ],
  },
  {
    titulo: "Definir metas mensais de captação de pacientes",
    descricao: "Estabelecer indicadores e metas de novos atendimentos para cada mês.",
    pilarSlug: "marketing",
    prioridade: "media",
    coluna: "backlog",
    ordem: 3,
    tarefas: [
      "Levantar o histórico de captação dos últimos meses",
      "Definir a meta mensal de novos pacientes",
      "Escolher os indicadores de acompanhamento",
      "Montar painel de acompanhamento das metas",
    ],
  },
  {
    titulo: "Implantar controle de fluxo de caixa semanal",
    descricao: "Configurar planilha ou sistema para acompanhamento das entradas e saídas semanais.",
    pilarSlug: "financeiro",
    prioridade: "alta",
    coluna: "todo",
    ordem: 1,
    tarefas: [
      "Escolher a planilha ou sistema de fluxo de caixa",
      "Cadastrar contas a pagar e a receber",
      "Definir a rotina semanal de atualização",
      "Revisar o saldo projetado toda semana",
    ],
  },
  {
    titulo: "Criar plano de cargos e salários",
    descricao: "Estruturar política de remuneração e progressão de carreira para a equipe.",
    pilarSlug: "pessoas",
    prioridade: "media",
    coluna: "todo",
    ordem: 2,
    tarefas: [
      "Mapear cargos e funções atuais",
      "Pesquisar faixas salariais de mercado",
      "Definir faixas e critérios de progressão",
      "Formalizar e comunicar o plano à equipe",
    ],
  },
  {
    titulo: "Configurar sistema de gestão da clínica",
    descricao: "Implementar e parametrizar o software de prontuário e agendamento.",
    pilarSlug: "tecnologia",
    prioridade: "alta",
    coluna: "doing",
    ordem: 1,
    tarefas: [
      "Cadastrar usuários e permissões",
      "Importar a base de pacientes",
      "Parametrizar agenda e prontuário",
      "Treinar a equipe no sistema",
    ],
  },
  {
    titulo: "Estruturar reunião quinzenal de equipe",
    descricao: "Definir pauta-padrão e frequência das reuniões de alinhamento interno.",
    pilarSlug: "pessoas",
    prioridade: "media",
    coluna: "doing",
    ordem: 2,
    tarefas: [
      "Definir a pauta-padrão da reunião",
      "Agendar a recorrência quinzenal",
      "Definir o responsável pela ata",
      "Acompanhar as pendências da reunião anterior",
    ],
  },
  {
    titulo: "Revisar contratos com fornecedores",
    descricao: "Analisar termos contratuais e identificar oportunidades de renegociação.",
    pilarSlug: "contabil",
    prioridade: "media",
    coluna: "review",
    ordem: 1,
    tarefas: [
      "Levantar os contratos vigentes",
      "Analisar prazos e condições de cada contrato",
      "Identificar oportunidades de renegociação",
      "Renegociar ou substituir fornecedores críticos",
    ],
  },
  {
    titulo: "Realizar diagnóstico inicial ICS",
    descricao: "Aplicar questionário de diagnóstico ICS para mapeamento dos pilares da clínica.",
    pilarSlug: "estrategia",
    prioridade: "alta",
    coluna: "done",
    ordem: 1,
    tarefas: [
      "Agendar a aplicação do diagnóstico",
      "Responder às perguntas do diagnóstico",
      "Revisar os resultados por pilar",
      "Priorizar os pilares críticos para o plano de ação",
    ],
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
  tarefas: number;
}> {
  const template = await getTemplateForPlan(plan);

  // Tudo numa transação para manter "ação + tarefas curadas" atômico e
  // idempotente. As queries rodam em sequência (a tx usa uma única conexão).
  return db.transaction(async (tx) => {
    const existingDelegacoes = await tx
      .select()
      .from(delegacoesTable)
      .where(and(eq(delegacoesTable.clinicId, clinicId), eq(delegacoesTable.nivel, 1)));
    const existingRisks = await tx
      .select({ nome: risksTable.nome })
      .from(risksTable)
      .where(eq(risksTable.clinicId, clinicId));
    const existingActions = await tx
      .select({
        id: actionsTable.id,
        titulo: actionsTable.titulo,
        pilarSlug: actionsTable.pilarSlug,
      })
      .from(actionsTable)
      .where(eq(actionsTable.clinicId, clinicId));

    const existingSlugs = new Set(existingDelegacoes.map((d) => d.pilarSlug));
    const existingRiskNames = new Set(existingRisks.map((r) => r.nome));
    const existingActionTitles = new Set(existingActions.map((a) => a.titulo));

    const pilaresToCreate = template.pilares.filter((p) => !existingSlugs.has(p.slug));
    const risksToCreate = template.risks.filter((r) => !existingRiskNames.has(r.nome));
    const actionsToCreate = template.actions.filter((a) => !existingActionTitles.has(a.titulo));

    const now = new Date();

    const createdDelegacoes =
      pilaresToCreate.length > 0
        ? await tx
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
        : [];

    const createdRisks =
      risksToCreate.length > 0
        ? await tx
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
        : [];

    const createdActions =
      actionsToCreate.length > 0
        ? await tx
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
        : [];

    // Anexa tarefas curadas. Match por titulo+pilarSlug; idempotente: só cria
    // tarefas para ações (novas OU já existentes) que tenham ZERO tarefas
    // top-level — assim re-rodar o seed nunca duplica.
    const tarefasByKey = new Map<string, string[]>();
    for (const a of template.actions) {
      if (a.tarefas && a.tarefas.length > 0) {
        tarefasByKey.set(`${a.titulo}__${a.pilarSlug ?? ""}`, a.tarefas);
      }
    }

    const candidates: { id: string; titles: string[] }[] = [];
    for (const act of [...existingActions, ...createdActions]) {
      const titles = tarefasByKey.get(`${act.titulo}__${act.pilarSlug ?? ""}`);
      if (titles) candidates.push({ id: act.id, titles });
    }

    let tarefasCreated = 0;
    if (candidates.length > 0) {
      const withTarefas = await tx
        .selectDistinct({ acaoId: acaoTarefasTable.acaoId })
        .from(acaoTarefasTable)
        .where(
          and(
            inArray(
              acaoTarefasTable.acaoId,
              candidates.map((c) => c.id)
            ),
            isNull(acaoTarefasTable.parentTarefaId)
          )
        );
      const actionIdsWithTarefas = new Set(withTarefas.map((r) => r.acaoId));

      for (const c of candidates) {
        if (actionIdsWithTarefas.has(c.id)) continue;
        const created = await createSuggestedTarefas(tx, c.id, c.titles);
        tarefasCreated += created.length;
      }
    }

    return {
      delegacoes: createdDelegacoes.length,
      risks: createdRisks.length,
      actions: createdActions.length,
      tarefas: tarefasCreated,
    };
  });
}
