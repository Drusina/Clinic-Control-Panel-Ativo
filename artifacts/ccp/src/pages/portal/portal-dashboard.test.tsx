import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";

/**
 * Manager portal home ("Home do gestor") contract.
 *
 * The redesigned home renders top-to-bottom from REAL clinic-scoped data:
 *   1. a clinic header card (name + compact implantação progress),
 *   2. the Trilha de implementação (stubbed here),
 *   3. a Plano de Ação panorama (board-stage counters + ações abertas por
 *      pilar + "Ver board"),
 *   4. a Tarefas execution list (Equipe/Minhas toggle + status counters +
 *      rows showing the parent ação), and
 *   5. a grouped module hub with discreet indicators.
 *
 * These tests pin that structure and the client-side aggregation. No fake
 * data: every number is derived from the mocked hooks.
 */

const mocks = vi.hoisted(() => ({
  clinic: null as Record<string, unknown> | null,
  card: null as Record<string, unknown> | null,
  risks: [] as Record<string, unknown>[],
  actions: [] as Record<string, unknown>[],
  diagnostics: [] as Record<string, unknown>[],
  tarefas: [] as Record<string, unknown>[],
  lastTarefaParams: undefined as unknown,
}));

vi.mock("wouter", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetClinic: () => ({ data: mocks.clinic }),
  getGetClinicQueryKey: () => ["clinic"],
  useListRisks: () => ({ data: mocks.risks, isLoading: false }),
  getListRisksQueryKey: () => ["risks"],
  useListActions: () => ({ data: mocks.actions, isLoading: false }),
  getListActionsQueryKey: () => ["actions"],
  useListDiagnostics: () => ({ data: mocks.diagnostics, isLoading: false }),
  getListDiagnosticsQueryKey: () => ["diagnostics"],
  useListClinicTarefas: (_clinicId: string, params: unknown) => {
    mocks.lastTarefaParams = params;
    return { data: mocks.tarefas, isLoading: false };
  },
  getListClinicTarefasQueryKey: () => ["clinic-tarefas"],
}));

vi.mock("@/hooks/use-auth", () => ({
  MY_CLINICS_QUERY_KEY: ["me", "clinics"],
  useMyClinics: () => ({
    data: { clinics: mocks.card ? [mocks.card] : [] },
  }),
}));

vi.mock("@/components/trilha/trilha-stepper", () => ({
  TrilhaStepper: () => <div data-testid="trilha-stepper-stub" />,
}));

import PortalDashboard from "./portal-dashboard";

const CLINIC_ID = "11111111-2222-4333-8444-555566667777";

function seedFullClinic() {
  mocks.clinic = {
    id: CLINIC_ID,
    nome: "Clínica Alpha",
    cnpj: "12.345.678/0001-90",
    cidade: "São Paulo",
    uf: "SP",
    status: "prospect",
    plano: "starter",
    logoUrl: null,
  };
  mocks.card = {
    id: CLINIC_ID,
    nome: "Clínica Alpha",
    fantasia: "Alpha",
    progresso: 40,
    etapa: "Implantação",
    status: "prospect",
    plano: "starter",
    logoUrl: null,
  };
  mocks.risks = [
    { id: "r1", nome: "Risco alto", status: "identificado", nivel: "alto", severidade: 20 },
    { id: "r2", nome: "Risco médio sev16", status: "em_mitigacao", nivel: "medio", severidade: 16 },
    { id: "r3", nome: "Risco mitigado", status: "mitigado", nivel: "alto", severidade: 25 },
    { id: "r4", nome: "Risco baixo", status: "identificado", nivel: "baixo", severidade: 8 },
  ];
  mocks.actions = [
    { id: "a1", titulo: "Ação 1", coluna: "todo", pilarSlug: "financeiro" },
    { id: "a2", titulo: "Ação 2", coluna: "backlog", pilarSlug: "financeiro" },
    { id: "a3", titulo: "Ação 3", coluna: "doing", pilarSlug: "estrategia" },
    { id: "a4", titulo: "Ação 4", coluna: "review", pilarSlug: "pessoas" },
    { id: "a5", titulo: "Ação 5", coluna: "done", pilarSlug: "financeiro" },
  ];
  mocks.diagnostics = [
    { id: "d2", versao: 2, status: "concluido", scoreGlobal: 3.7 },
    { id: "d1", versao: 1, status: "concluido", scoreGlobal: 2.1 },
  ];
  mocks.tarefas = [
    {
      id: "t1",
      titulo: "Revisar contrato",
      acaoTitulo: "Contrato fornecedor",
      responsavelNome: "João",
      status: "a_fazer",
      prazo: "2026-07-01",
    },
    {
      id: "t2",
      titulo: "Atualizar planilha",
      acaoTitulo: "Financeiro",
      responsavelNome: "Maria",
      status: "fazendo",
      prazo: "2026-06-20",
    },
    {
      id: "t3",
      titulo: "Enviar relatório",
      acaoTitulo: "Relatórios",
      responsavelNome: "Ana",
      status: "concluida",
      prazo: "2026-06-01",
    },
  ];
}

describe("PortalDashboard — Home do gestor", () => {
  beforeEach(seedFullClinic);
  afterEach(cleanup);

  it("renders header, trilha, plano de ação, tarefas and the module hub", () => {
    render(<PortalDashboard clinicId={CLINIC_ID} />);

    expect(screen.getByTestId("painel-clinic-name")).toHaveTextContent(
      "Clínica Alpha",
    );
    expect(screen.getByTestId("painel-progresso")).toHaveTextContent("40%");
    expect(screen.getByTestId("trilha-stepper-stub")).toBeInTheDocument();
    expect(screen.getByTestId("painel-plano-acao")).toBeInTheDocument();
    expect(screen.getByTestId("painel-tarefas")).toBeInTheDocument();
    // a representative tile from each hub group
    expect(screen.getByTestId("module-card-agenda")).toBeInTheDocument();
    expect(screen.getByTestId("module-card-diagnostico")).toBeInTheDocument();
    expect(screen.getByTestId("module-card-documentos")).toBeInTheDocument();
  });

  it("derives Plano de Ação stage counters from the board columns", () => {
    render(<PortalDashboard clinicId={CLINIC_ID} />);

    // backlog + todo fold into "A fazer"
    expect(
      within(screen.getByTestId("plano-stage-a_fazer")).getByText("2"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("plano-stage-em_andamento")).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("plano-stage-revisao")).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("plano-stage-concluido")).getByText("1"),
    ).toBeInTheDocument();
  });

  it("lists ações abertas por pilar (open actions only)", () => {
    render(<PortalDashboard clinicId={CLINIC_ID} />);

    // financeiro has 2 OPEN actions (the done one is excluded)
    expect(
      within(screen.getByTestId("plano-pilar-financeiro")).getByText("2"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("plano-pilar-estrategia")).toBeInTheDocument();
    expect(screen.getByTestId("plano-pilar-pessoas")).toBeInTheDocument();
  });

  it("links 'Ver board' to the Plano de Ação module of this clinic", () => {
    render(<PortalDashboard clinicId={CLINIC_ID} />);

    expect(screen.getByTestId("plano-ver-board")).toHaveAttribute(
      "href",
      `/portal/clinica/${CLINIC_ID}/acao`,
    );
  });

  it("aggregates tarefa status counters and renders rows with the parent ação", () => {
    render(<PortalDashboard clinicId={CLINIC_ID} />);

    expect(
      within(screen.getByTestId("tarefa-status-a_fazer")).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("tarefa-status-fazendo")).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("tarefa-status-concluida")).getByText("1"),
    ).toBeInTheDocument();

    const row = screen.getByTestId("tarefa-t1");
    expect(row).toHaveTextContent("Revisar contrato");
    expect(row).toHaveTextContent("Ação: Contrato fornecedor");
    expect(row).toHaveTextContent("João");
  });

  it("defaults the Tarefas scope to Equipe and toggles to Minhas", () => {
    render(<PortalDashboard clinicId={CLINIC_ID} />);

    const equipe = screen.getByTestId("tarefas-toggle-equipe");
    const minhas = screen.getByTestId("tarefas-toggle-minhas");
    expect(equipe).toHaveAttribute("aria-pressed", "true");
    expect(minhas).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(minhas);
    expect(screen.getByTestId("tarefas-toggle-minhas")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("requests mine=true from the tarefas hook only in the Minhas scope", () => {
    render(<PortalDashboard clinicId={CLINIC_ID} />);

    // default Equipe scope sends no filter
    expect(mocks.lastTarefaParams).toEqual({});

    fireEvent.click(screen.getByTestId("tarefas-toggle-minhas"));
    expect(mocks.lastTarefaParams).toEqual({ mine: true });

    fireEvent.click(screen.getByTestId("tarefas-toggle-equipe"));
    expect(mocks.lastTarefaParams).toEqual({});
  });

  it("surfaces discreet hub indicators from loaded data", () => {
    render(<PortalDashboard clinicId={CLINIC_ID} />);

    // 2 open critical risks (alto OR severidade > 14, open statuses only)
    expect(screen.getByTestId("module-card-riscos")).toHaveTextContent(
      "2 críticos",
    );
    // 4 open actions
    expect(screen.getByTestId("module-card-acao")).toHaveTextContent(
      "4 abertas",
    );
    // maturidade from the latest concluded diagnostic
    expect(screen.getByTestId("module-card-diagnostico")).toHaveTextContent(
      "3.7/5",
    );
  });

  it("shows the empty Tarefas state when there are no tasks", () => {
    mocks.tarefas = [];

    render(<PortalDashboard clinicId={CLINIC_ID} />);

    expect(screen.getByText("Nenhuma tarefa")).toBeInTheDocument();
  });

  it("shows the clinic name from the card when the clinic record is missing", () => {
    mocks.clinic = null;

    render(<PortalDashboard clinicId={CLINIC_ID} />);

    expect(screen.getByTestId("painel-clinic-name")).toHaveTextContent("Alpha");
  });
});
