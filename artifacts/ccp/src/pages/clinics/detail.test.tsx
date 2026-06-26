import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Task #339 — the super-admin clinic detail is a single tabbed shell whose
 * active tab is URL-driven via `?tab=`:
 *
 *   • It READS `?tab=` on mount (falling back to the default "cadastro" tab when
 *     the param is missing or unknown).
 *   • It WRITES `?tab=` on every tab change using a history REPLACE so the
 *     back button isn't polluted with one entry per tab click.
 *   • Diagnóstico owns the extra `?aba=`/`?diagnostico=` deep-link params, so
 *     leaving the Diagnóstico tab must CLEAR them — they must not leak onto any
 *     other tab's URL.
 *
 * Clinic id must look like a uuid/hex slug so the layout-style routing matches.
 */

const CLINIC = "aaaaaaaa-1111-2222-3333-444444444444";

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  search: "",
}));

vi.mock("wouter", () => ({
  useParams: () => ({ id: CLINIC }),
  useLocation: () => ["/admin/clinicas/" + CLINIC, mocks.navigateMock] as const,
  useSearch: () => mocks.search,
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetClinic: () => ({
    data: {
      id: CLINIC,
      nome: "Clínica Gamma",
      status: "ativa",
      plano: "premium",
      cnpj: "00.000.000/0001-00",
      cidade: "São Paulo",
      uf: "SP",
      logoUrl: null,
    },
    isLoading: false,
  }),
  getGetClinicQueryKey: () => ["clinic", CLINIC],
}));

// Tab content + heavy children are irrelevant to the tab-routing contract; stub
// them so only the Tabs chrome (triggers) drives navigation.
vi.mock("@/components/trilha/trilha-stepper", () => ({
  TrilhaStepper: () => <div data-testid="stub-trilha" />,
}));
vi.mock("@/components/clinic-logo", () => ({
  ClinicLogo: () => <div data-testid="stub-logo" />,
}));
vi.mock("./index", () => ({
  getStatusBadgeVariant: () => "default",
  getPlanBadgeVariant: () => "default",
}));

function stub(testid: string) {
  return { default: () => <div data-testid={testid} /> };
}
vi.mock("./tabs/overview-tab", () => stub("stub-overview"));
vi.mock("./tabs/kickoff-tab", () => stub("stub-kickoff"));
vi.mock("./tabs/diagnostico-section", () => stub("stub-diagnostico"));
vi.mock("./tabs/action-plan-tab", () => stub("stub-actions"));
vi.mock("./tabs/risks-tab", () => stub("stub-risks"));
vi.mock("./tabs/team-tab", () => stub("stub-team"));
vi.mock("./tabs/rede-externa-tab", () => stub("stub-rede"));
vi.mock("./tabs/sistemas-acessos-tab", () => stub("stub-sistemas"));
vi.mock("./tabs/financial-tab", () => stub("stub-financial"));
vi.mock("./tabs/cadastro-tab", () => stub("stub-cadastro"));
vi.mock("./tabs/status-tab", () => stub("stub-status"));
vi.mock("./tabs/usuarios-tab", () => stub("stub-usuarios"));
vi.mock("./tabs/atividade-tab", () => stub("stub-atividade"));
vi.mock("./tabs/documentos-tab", () => stub("stub-documentos"));
vi.mock("@/components/agenda/agenda-module", () => stub("stub-agenda"));

import ClinicDetail from "./detail";

describe("ClinicDetail — URL-driven ?tab= shell", () => {
  beforeEach(() => {
    mocks.navigateMock.mockClear();
    mocks.search = "";
  });

  afterEach(() => {
    cleanup();
  });

  it("defaults to the Cadastro tab when no ?tab= is present", () => {
    mocks.search = "";
    render(<ClinicDetail />);
    expect(screen.getByTestId("tab-cadastro")).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("reads ?tab= and activates the matching tab", () => {
    mocks.search = "tab=risks";
    render(<ClinicDetail />);
    expect(screen.getByRole("tab", { name: "Riscos" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("falls back to Cadastro when ?tab= is unknown", () => {
    mocks.search = "tab=bogus";
    render(<ClinicDetail />);
    expect(screen.getByTestId("tab-cadastro")).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("writes ?tab= on tab change using a history replace", async () => {
    const user = userEvent.setup();
    mocks.search = "";
    render(<ClinicDetail />);

    await user.click(screen.getByRole("tab", { name: "Riscos" }));

    expect(mocks.navigateMock).toHaveBeenCalledWith(
      `/admin/clinicas/${CLINIC}?tab=risks`,
      { replace: true },
    );
  });

  it("clears aba/diagnostico when leaving the Diagnóstico tab", async () => {
    const user = userEvent.setup();
    mocks.search = "tab=diagnostics&aba=delegacao&diagnostico=diag-1";
    render(<ClinicDetail />);

    await user.click(screen.getByTestId("tab-cadastro"));

    const [url, opts] = mocks.navigateMock.mock.calls.at(-1)!;
    expect(url).toBe(`/admin/clinicas/${CLINIC}?tab=cadastro`);
    expect(url).not.toContain("aba=");
    expect(url).not.toContain("diagnostico=");
    expect(opts).toEqual({ replace: true });
  });

  it("preserves aba/diagnostico while staying on the Diagnóstico tab", async () => {
    const user = userEvent.setup();
    mocks.search = "tab=risks&aba=delegacao&diagnostico=diag-1";
    render(<ClinicDetail />);

    await user.click(screen.getByRole("tab", { name: "Diagnóstico" }));

    const [url] = mocks.navigateMock.mock.calls.at(-1)!;
    expect(url).toContain("tab=diagnostics");
    expect(url).toContain("aba=delegacao");
    expect(url).toContain("diagnostico=diag-1");
  });
});
