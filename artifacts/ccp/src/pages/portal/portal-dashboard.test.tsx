import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

/**
 * Unified "Painel da Clínica" — Visão Geral (dashboard) contract.
 *
 * The hub landing must surface, from REAL data only: the implantação
 * progress, the ICS counters, a derived "Pendências" list, and the clinic's
 * "Contato principal". These tests pin those four blocks and assert the
 * pendências are derived from the ICS status + progress (no fake data) and
 * that the contact block reflects the clinic record (with an empty state).
 */

const mocks = vi.hoisted(() => ({
  clinic: null as Record<string, unknown> | null,
  card: null as Record<string, unknown> | null,
  ics: null as Record<string, unknown> | null,
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
}));

vi.mock("@/hooks/use-auth", () => ({
  getStoredToken: () => null,
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

function mockIcsFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mocks.ics),
      } as Response),
    ),
  );
}

describe("PortalDashboard — Visão Geral contract", () => {
  beforeEach(() => {
    mocks.clinic = {
      id: CLINIC_ID,
      nome: "Clínica Alpha",
      responsavel: "Dra. Marina",
      cargo: "Diretora",
      email: "marina@alpha.com.br",
      whatsapp: "+55 11 99999-0000",
    };
    mocks.card = {
      id: CLINIC_ID,
      nome: "Clínica Alpha",
      progresso: 40,
      etapa: "Implantação",
    };
    mocks.ics = { delegacoes: 0, risks: 0, actions: 0, seeded: false };
    mockIcsFetch();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the four required blocks: progresso, ICS, pendências, contato", () => {
    render(<PortalDashboard clinicId={CLINIC_ID} />);

    expect(screen.getByTestId("painel-progresso")).toBeInTheDocument();
    expect(screen.getByTestId("painel-ics-status")).toBeInTheDocument();
    expect(screen.getByTestId("painel-pendencias")).toBeInTheDocument();
    expect(screen.getByTestId("painel-contato-principal")).toBeInTheDocument();
  });

  it("derives pendências from real ICS status + progress (no fake data)", async () => {
    render(<PortalDashboard clinicId={CLINIC_ID} />);

    // progresso < 100 → implantação pendência appears immediately
    expect(screen.getByTestId("pendencia-implantacao")).toHaveTextContent(
      "Implantação 40% concluída",
    );

    // diagnostic not seeded → pendência after the ICS fetch resolves, linking
    // into the diagnóstico section of THIS clinic.
    const diag = await screen.findByTestId("pendencia-diagnostico");
    expect(diag).toHaveAttribute(
      "href",
      `/portal/clinica/${CLINIC_ID}/diagnostico`,
    );
  });

  it("shows the empty pendências state once everything is complete", async () => {
    mocks.ics = { delegacoes: 3, risks: 2, actions: 5, seeded: true };
    mocks.card = { ...mocks.card!, progresso: 100 };

    render(<PortalDashboard clinicId={CLINIC_ID} />);

    await waitFor(() =>
      expect(
        screen.getByText("Nenhuma pendência no momento."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("pendencia-implantacao")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pendencia-diagnostico")).not.toBeInTheDocument();
  });

  it("renders the clinic's contato principal from the clinic record", () => {
    render(<PortalDashboard clinicId={CLINIC_ID} />);

    const contato = screen.getByTestId("painel-contato-principal");
    expect(contato).toHaveTextContent("Dra. Marina");
    expect(contato).toHaveTextContent("Diretora");
    expect(
      screen.getByRole("link", { name: /marina@alpha\.com\.br/ }),
    ).toHaveAttribute("href", "mailto:marina@alpha.com.br");
  });

  it("shows an empty contato state when no contact is on the clinic record", () => {
    mocks.clinic = { id: CLINIC_ID, nome: "Clínica Alpha" };

    render(<PortalDashboard clinicId={CLINIC_ID} />);

    expect(
      screen.getByText("Nenhum contato principal cadastrado."),
    ).toBeInTheDocument();
  });
});
