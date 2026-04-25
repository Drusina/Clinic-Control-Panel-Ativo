import type { Node, Edge } from "reactflow";

export type ProcessoTemplate = {
  id: string;
  nome: string;
  descricao: string;
  pilarSlug: string;
  duracaoMedia: string;
  flowNodes: Node[];
  flowEdges: Edge[];
};

function makeLinearFlow(steps: string[]): { nodes: Node[]; edges: Edge[] } {
  const gap = 200;
  const nodes: Node[] = steps.map((label, i) => ({
    id: `${i + 1}`,
    position: { x: i * gap + 80, y: 150 },
    data: { label },
    type: i === 0 ? "input" : i === steps.length - 1 ? "output" : undefined,
  }));
  const edges: Edge[] = steps.slice(0, -1).map((_, i) => ({
    id: `e${i + 1}-${i + 2}`,
    source: `${i + 1}`,
    target: `${i + 2}`,
  }));
  return { nodes, edges };
}

function makeBranchFlow(params: {
  start: string;
  branches: { label: string; steps: string[] }[];
  end: string;
}): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let idCounter = 1;

  const startId = `${idCounter++}`;
  nodes.push({ id: startId, position: { x: 80, y: 200 }, data: { label: params.start }, type: "input" });

  const branchCount = params.branches.length;
  const ySpacing = 160;
  const startY = 200 - ((branchCount - 1) * ySpacing) / 2;

  const branchEndIds: string[] = [];

  params.branches.forEach((branch, bi) => {
    const yPos = startY + bi * ySpacing;
    let prevId = startId;
    [branch.label, ...branch.steps].forEach((label, si) => {
      const nodeId = `${idCounter++}`;
      nodes.push({ id: nodeId, position: { x: 300 + si * 200, y: yPos }, data: { label } });
      edges.push({ id: `e${prevId}-${nodeId}`, source: prevId, target: nodeId });
      prevId = nodeId;
    });
    branchEndIds.push(prevId);
  });

  const maxX = Math.max(...nodes.map(n => n.position.x));
  const endId = `${idCounter++}`;
  nodes.push({ id: endId, position: { x: maxX + 200, y: 200 }, data: { label: params.end }, type: "output" });
  branchEndIds.forEach(bid => {
    edges.push({ id: `e${bid}-${endId}`, source: bid, target: endId });
  });

  return { nodes, edges };
}

const patientIntake = makeLinearFlow([
  "Chegada do Paciente",
  "Recepção e Triagem",
  "Verificação de Cadastro",
  "Confirmação de Convênio",
  "Encaminhamento ao Consultório",
  "Atendimento Médico",
  "Alta / Retorno",
]);

const appointmentBooking = makeLinearFlow([
  "Solicitação de Agendamento",
  "Verificar Disponibilidade",
  "Registrar Agendamento",
  "Confirmar com Paciente",
  "Lembrete Automático (D-1)",
  "Check-in na Data",
]);

const billingCycle = makeLinearFlow([
  "Realização do Atendimento",
  "Registro de Procedimentos",
  "Emissão de Nota Fiscal",
  "Submissão ao Plano/Convênio",
  "Auditoria da Fatura",
  "Recebimento do Pagamento",
  "Conciliação Financeira",
]);

const staffOnboarding = makeBranchFlow({
  start: "Contratação Aprovada",
  branches: [
    { label: "Documentação RH", steps: ["Assinatura de Contrato", "Cadastro em Sistemas"] },
    { label: "Treinamento Clínico", steps: ["Protocolos Internos", "Segurança do Paciente"] },
  ],
  end: "Colaborador Ativo",
});

const complianceReview = makeLinearFlow([
  "Mapeamento de Requisitos",
  "Análise de Conformidade",
  "Identificação de Gaps",
  "Plano de Ação",
  "Implementação de Melhorias",
  "Auditoria Interna",
  "Relatório Final",
]);

export const PROCESS_TEMPLATES: ProcessoTemplate[] = [
  {
    id: "patient-intake",
    nome: "Recepção de Pacientes",
    descricao:
      "Fluxo completo de acolhimento do paciente desde a chegada até o encaminhamento ao consultório, incluindo triagem e validação de convênio.",
    pilarSlug: "operacoes",
    duracaoMedia: "15 a 30 minutos",
    flowNodes: patientIntake.nodes,
    flowEdges: patientIntake.edges,
  },
  {
    id: "appointment-booking",
    nome: "Agendamento de Consultas",
    descricao:
      "Processo de marcação de consultas desde a solicitação do paciente até o check-in no dia do atendimento, com confirmação e lembrete.",
    pilarSlug: "operacoes",
    duracaoMedia: "5 a 10 minutos",
    flowNodes: appointmentBooking.nodes,
    flowEdges: appointmentBooking.edges,
  },
  {
    id: "billing-cycle",
    nome: "Faturamento e Cobrança",
    descricao:
      "Ciclo financeiro completo do atendimento ao recebimento: emissão de nota, submissão ao convênio, auditoria e conciliação.",
    pilarSlug: "financeiro",
    duracaoMedia: "2 a 5 dias úteis",
    flowNodes: billingCycle.nodes,
    flowEdges: billingCycle.edges,
  },
  {
    id: "staff-onboarding",
    nome: "Integração de Colaboradores",
    descricao:
      "Fluxo de onboarding de novos membros da equipe: documentação no RH e treinamento clínico em paralelo até a ativação no sistema.",
    pilarSlug: "pessoas",
    duracaoMedia: "3 a 5 dias",
    flowNodes: staffOnboarding.nodes,
    flowEdges: staffOnboarding.edges,
  },
  {
    id: "compliance-review",
    nome: "Revisão de Conformidade Regulatória",
    descricao:
      "Processo de avaliação e adequação às exigências regulatórias: mapeamento, análise de gaps, plano de ação, implementação e auditoria.",
    pilarSlug: "compliance",
    duracaoMedia: "2 a 4 semanas",
    flowNodes: complianceReview.nodes,
    flowEdges: complianceReview.edges,
  },
];
