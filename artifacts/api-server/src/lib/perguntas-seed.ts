import { eq, count } from "drizzle-orm";
import { db, perguntasTable } from "@workspace/db";
import { logger } from "./logger";

type SeedTipo = "escala_1_5" | "sim_nao" | "numerico";

interface SeedPergunta {
  texto: string;
  tipo: SeedTipo;
  peso?: number;
  dica?: string;
  valorMin?: number;
  valorMax?: number;
  inverso?: boolean;
}

interface SeedPilar {
  slug: string;
  nome: string;
  ordem: number;
  perguntas: SeedPergunta[];
}

export const PERGUNTAS_SEED: SeedPilar[] = [
  {
    slug: "estrategia",
    nome: "Estratégia e Governança",
    ordem: 1,
    perguntas: [
      { texto: "A clínica possui missão, visão e valores formalmente documentados e divulgados à equipe?", tipo: "sim_nao", peso: 1.0 },
      { texto: "Existe um planejamento estratégico anual com metas mensuráveis?", tipo: "escala_1_5", peso: 1.5, dica: "Considere clareza, prazo definido e indicadores de acompanhamento." },
      { texto: "Os sócios e gestores se reúnem periodicamente para revisar resultados?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Existe um organograma claro com responsáveis por cada área?", tipo: "sim_nao", peso: 1.0 },
      { texto: "A clínica utiliza KPIs estratégicos para acompanhar a performance global?", tipo: "escala_1_5", peso: 1.5, dica: "Ex.: ticket médio, ocupação, NPS, EBITDA." },
      { texto: "O modelo societário e a governança estão formalizados em contrato/acordo?", tipo: "sim_nao", peso: 1.0 },
      { texto: "Existe um plano de sucessão ou contingência para posições-chave?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica avalia o ambiente competitivo e o posicionamento de mercado?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Existem reuniões formais de revisão estratégica trimestral?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A direção comunica claramente as prioridades estratégicas à equipe?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica mantém indicadores de saúde do negócio (margens, crescimento)?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Há um comitê ou rotina de tomada de decisão para investimentos relevantes?", tipo: "sim_nao", peso: 1.0 },
      { texto: "Os objetivos individuais da equipe estão alinhados com os objetivos estratégicos?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica possui um plano de expansão ou crescimento documentado?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica realiza análise de SWOT (Forças, Fraquezas, Oportunidades, Ameaças) periodicamente?", tipo: "escala_1_5", peso: 1.0 },
    ],
  },
  {
    slug: "financeiro",
    nome: "Financeiro e Fluxo de Caixa",
    ordem: 2,
    perguntas: [
      { texto: "A clínica controla o fluxo de caixa diariamente?", tipo: "escala_1_5", peso: 1.5 },
      { texto: "Existe separação clara entre conta da clínica e conta dos sócios?", tipo: "sim_nao", peso: 1.5 },
      { texto: "A clínica tem reserva de caixa equivalente a quantos meses de operação?", tipo: "numerico", peso: 1.5, valorMin: 0, valorMax: 6, dica: "Em meses." },
      { texto: "Existem orçamentos anuais por centro de custo?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A inadimplência de pacientes é monitorada e cobrada sistematicamente?", tipo: "escala_1_5", peso: 1.5 },
      { texto: "Os preços dos procedimentos são revisados com base em margem e custo real?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica possui DRE (Demonstração de Resultado) mensal?", tipo: "sim_nao", peso: 1.5 },
      { texto: "Há análise de rentabilidade por procedimento/serviço?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "As contas a pagar são planejadas com antecedência mínima de 30 dias?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica utiliza sistema de gestão financeira (não apenas planilhas)?", tipo: "sim_nao", peso: 1.0 },
      { texto: "Existe controle de centro de custos por especialidade ou unidade?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica analisa indicadores de margem bruta e líquida mensalmente?", tipo: "escala_1_5", peso: 1.0 },
    ],
  },
  {
    slug: "contabil",
    nome: "Contabilidade e Fiscal",
    ordem: 3,
    perguntas: [
      { texto: "A clínica conta com contador especializado em saúde?", tipo: "sim_nao", peso: 1.5 },
      { texto: "O regime tributário é revisado anualmente para otimização fiscal?", tipo: "escala_1_5", peso: 1.5 },
      { texto: "A clínica está em dia com todas as obrigações acessórias (DCTF, EFD, etc.)?", tipo: "escala_1_5", peso: 1.5 },
      { texto: "Existe conciliação bancária mensal?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Os relatórios contábeis são entregues até o 10º dia útil do mês seguinte?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A folha de pagamento é processada com revisão dupla?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica passou por alguma autuação fiscal nos últimos 24 meses?", tipo: "sim_nao", peso: 1.0, inverso: true, dica: "Marque 'sim' apenas se houve autuação — pontuação inversa." },
      { texto: "Os contratos com fornecedores e prestadores estão formalizados?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Há controle dos impostos retidos na fonte e DARFs em dia?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica realiza auditoria contábil interna ou externa periódica?", tipo: "escala_1_5", peso: 1.0 },
    ],
  },
  {
    slug: "marketing",
    nome: "Vendas, Marketing e Captação",
    ordem: 4,
    perguntas: [
      { texto: "A clínica possui presença ativa em redes sociais (Instagram, etc.)?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Existe um funil de captação de novos pacientes documentado?", tipo: "escala_1_5", peso: 1.5 },
      { texto: "O site da clínica é otimizado para conversão e SEO?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica investe em mídia paga (Google Ads, Meta Ads)?", tipo: "sim_nao", peso: 1.0 },
      { texto: "Existe acompanhamento de CAC (Custo de Aquisição por Paciente)?", tipo: "escala_1_5", peso: 1.5 },
      { texto: "A clínica mede o LTV (Lifetime Value) dos pacientes?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Há estratégia ativa de retorno e fidelização de pacientes?", tipo: "escala_1_5", peso: 1.5 },
      { texto: "A taxa de conversão de orçamentos em tratamentos é monitorada?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica utiliza CRM para gestão do relacionamento com pacientes?", tipo: "sim_nao", peso: 1.0 },
      { texto: "A reputação online (Google Reviews, redes) é monitorada e respondida?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Existem campanhas promocionais ou sazonais planejadas?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A equipe comercial/atendimento recebe metas claras de captação?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica realiza pesquisa de NPS (satisfação do paciente)?", tipo: "escala_1_5", peso: 1.0 },
    ],
  },
  {
    slug: "operacoes",
    nome: "Processos Operacionais",
    ordem: 5,
    perguntas: [
      { texto: "Os principais processos operacionais estão documentados em POPs?", tipo: "escala_1_5", peso: 1.5 },
      { texto: "Existe checklist diário de abertura e fechamento da clínica?", tipo: "sim_nao", peso: 1.0 },
      { texto: "O agendamento de consultas é gerenciado por sistema?", tipo: "sim_nao", peso: 1.5 },
      { texto: "A taxa de ocupação da agenda é monitorada por profissional?", tipo: "escala_1_5", peso: 1.5 },
      { texto: "Existe controle de no-show (faltas) com ações de recuperação?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Há padronização de atendimento entre os profissionais?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "O controle de estoque de materiais é realizado mensalmente?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Os equipamentos têm cronograma de manutenção preventiva?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica acompanha o tempo médio de espera do paciente?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Existem indicadores de qualidade clínica (resultado, complicações)?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Os fluxos de paciente (chegada → alta) são otimizados?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica realiza pesquisa de satisfação após o atendimento?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Há gestão estruturada de fornecedores e contratos operacionais?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Os prontuários eletrônicos são preenchidos de forma completa e padronizada?", tipo: "escala_1_5", peso: 1.0 },
    ],
  },
  {
    slug: "pessoas",
    nome: "Gestão de Pessoas e Cultura",
    ordem: 6,
    perguntas: [
      { texto: "A clínica possui plano de cargos e salários formalizado?", tipo: "escala_1_5", peso: 1.5 },
      { texto: "Existe processo estruturado de recrutamento e seleção?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Os colaboradores recebem onboarding/integração ao serem contratados?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica investe em treinamentos técnicos e comportamentais?", tipo: "escala_1_5", peso: 1.5 },
      { texto: "Existe avaliação de desempenho periódica da equipe?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "O turnover (rotatividade) é monitorado mensalmente?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Há programa de reconhecimento ou bonificação por desempenho?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica realiza reuniões periódicas de alinhamento com a equipe?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "O clima organizacional é avaliado formalmente (pesquisa de clima)?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Existem políticas claras de feedback (1:1, avaliações 360º)?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Os profissionais clínicos têm metas de produtividade definidas?", tipo: "escala_1_5", peso: 1.0 },
    ],
  },
  {
    slug: "tecnologia",
    nome: "Tecnologia e Sistemas",
    ordem: 7,
    perguntas: [
      { texto: "A clínica utiliza prontuário eletrônico (EHR/EMR)?", tipo: "sim_nao", peso: 1.5 },
      { texto: "Os dados clínicos têm backup automático diário?", tipo: "escala_1_5", peso: 1.5 },
      { texto: "Existe política de senhas e controle de acessos por perfil?", tipo: "escala_1_5", peso: 1.5 },
      { texto: "A infraestrutura de TI (rede, computadores) é monitorada?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Existe plano de continuidade em caso de falha de sistemas?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Os sistemas são integrados (agenda, financeiro, prontuário)?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica utiliza assinaturas eletrônicas para documentos?", tipo: "sim_nao", peso: 1.0 },
      { texto: "Há suporte técnico contratado (interno ou externo)?", tipo: "sim_nao", peso: 1.0 },
      { texto: "Os softwares utilizados são licenciados e atualizados?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica utiliza relatórios de BI/dashboards para tomada de decisão?", tipo: "escala_1_5", peso: 1.0 },
    ],
  },
  {
    slug: "compliance",
    nome: "Compliance e Regulamentação",
    ordem: 8,
    perguntas: [
      { texto: "A clínica está em conformidade com a LGPD (Lei Geral de Proteção de Dados)?", tipo: "escala_1_5", peso: 1.5 },
      { texto: "Existe política de privacidade publicada e DPO/encarregado nomeado?", tipo: "escala_1_5", peso: 1.5 },
      { texto: "Os termos de consentimento de pacientes estão atualizados?", tipo: "escala_1_5", peso: 1.5 },
      { texto: "A clínica possui alvará sanitário e licença de funcionamento em dia?", tipo: "sim_nao", peso: 1.5 },
      { texto: "As normas da ANVISA aplicáveis são monitoradas e cumpridas?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Existe descarte adequado de resíduos de saúde (PGRSS)?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "Os profissionais possuem registros nos conselhos atualizados (CRM, CRO, etc.)?", tipo: "escala_1_5", peso: 1.0 },
      { texto: "A clínica realiza auditoria interna de compliance regulatório?", tipo: "escala_1_5", peso: 1.0 },
    ],
  },
];

/**
 * Idempotent seed: insere no banco apenas as (pilar, ordem) que ainda não
 * existem. Editar pergunta-exemplo via UI/CRUD não é sobrescrito por re-seed,
 * porque a chave (pilar_slug, ordem) já existe no banco.
 */
export async function seedPerguntasIfEmpty(): Promise<{ inserted: number; total: number }> {
  type InsertRow = typeof perguntasTable.$inferInsert;
  const toInsert: InsertRow[] = [];

  for (const pilar of PERGUNTAS_SEED) {
    pilar.perguntas.forEach((p, idx) => {
      const ordem = idx + 1;
      toInsert.push({
        pilarSlug: pilar.slug,
        pilarNome: pilar.nome,
        pilarOrdem: pilar.ordem,
        texto: p.texto,
        tipo: p.tipo,
        peso: (p.peso ?? 1).toFixed(2),
        ordem,
        dica: p.dica ?? null,
        valorMin: p.valorMin != null ? p.valorMin.toFixed(2) : null,
        valorMax: p.valorMax != null ? p.valorMax.toFixed(2) : null,
        inverso: p.inverso ?? false,
      });
    });
  }

  // DB-level idempotency: relies on the unique index on (pilar_slug, ordem).
  // Safe under concurrent multi-instance startup.
  const inserted = await db
    .insert(perguntasTable)
    .values(toInsert)
    .onConflictDoNothing({
      target: [perguntasTable.pilarSlug, perguntasTable.ordem],
    })
    .returning({ id: perguntasTable.id });

  // Skip the rest of the original "fall-through" logic — keep parity below.
  if (inserted.length === 0) {
    const [{ value: total }] = await db
      .select({ value: count() })
      .from(perguntasTable);
    return { inserted: 0, total };
  }

  // Update pilar_nome/pilar_ordem on existing rows so renaming a pilar (in
  // the seed file) propagates without needing to re-create rows.
  for (const pilar of PERGUNTAS_SEED) {
    await db
      .update(perguntasTable)
      .set({ pilarNome: pilar.nome, pilarOrdem: pilar.ordem })
      .where(eq(perguntasTable.pilarSlug, pilar.slug));
  }

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(perguntasTable);

  logger.info(
    { inserted: inserted.length, totalAfter: total },
    "Perguntas seed: inserted missing rows",
  );

  return { inserted: inserted.length, total };
}

/**
 * Helper used by tests / scripts to fully reset and re-seed perguntas for a
 * specific pilar. NOT called at boot.
 */
export async function resetPilarPerguntas(pilarSlug: string): Promise<void> {
  await db.delete(perguntasTable).where(eq(perguntasTable.pilarSlug, pilarSlug));
  await seedPerguntasIfEmpty();
}

export function listSeedPilares(): { slug: string; nome: string; ordem: number; questionCount: number }[] {
  return PERGUNTAS_SEED.map((p) => ({
    slug: p.slug,
    nome: p.nome,
    ordem: p.ordem,
    questionCount: p.perguntas.length,
  }));
}

