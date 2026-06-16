import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";

/**
 * Legacy portal-link routing contract.
 *
 * Managers (and old bookmarks/emails) still hit pre-panel URLs like
 * `/portal/delegacao/:clinicId`. These now redirect into the unified
 * "Painel da Clínica" at `/portal/clinica/:clinicId/<secao>`. An unknown
 * section under the canonical panel must fall back to the panel hub.
 *
 * Unlike the other suites, this one keeps REAL wouter (driven by an
 * in-memory history) and renders the actual App `Router`, so a future routing
 * change that breaks an old link fails here. We mock only the heavy
 * chrome/leaf screens the redirects land on — never the routing itself nor
 * the real PainelClinica (whose unknown-section redirect is under test).
 */

// Slim chrome — passthrough so the routed children render cheaply.
vi.mock("@/components/portal-layout", () => ({
  PortalLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="portal-layout">{children}</div>
  ),
}));
vi.mock("@/components/clinic-access-guard", () => ({
  ClinicAccessGuard: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// PainelClinica section bodies — mocked to trivial markers. The real
// PainelClinica is kept so its section->module mapping and the
// unknown-section -> hub redirect are exercised end-to-end.
const { stub } = vi.hoisted(() => ({
  stub: (label: string) => ({ default: () => <div>{label}</div> }),
}));
vi.mock("@/pages/portal/portal-dashboard", () => stub("portal-hub"));
vi.mock("@/pages/delegacao/index", () => stub("delegacao"));
vi.mock("@/pages/riscos/index", () => stub("riscos"));
vi.mock("@/pages/acao/index", () => stub("acao"));
vi.mock("@/pages/processos/index", () => stub("processos"));
vi.mock("@/pages/evidencias/index", () => stub("evidencias"));
vi.mock("@/pages/documentos/index", () => stub("documentos"));
vi.mock("@/pages/clinics/tabs/kickoff-tab", () => stub("kickoff"));
vi.mock("@/pages/clinics/tabs/diagnostico-section", () => stub("diagnostico"));
vi.mock("@/pages/clinics/tabs/diagnostics-tab", () => stub("diagnostico"));
vi.mock("@/pages/clinics/tabs/team-tab", () => stub("equipe"));
vi.mock("@/pages/clinics/tabs/rede-externa-tab", () => stub("rede-externa"));
vi.mock("@/pages/clinics/tabs/sistemas-acessos-tab", () =>
  stub("sistemas-acessos"),
);

// Keep the real session-scoped storage helpers (PainelClinica writes the
// active clinic id); only stub the network-bound auth/data hooks.
vi.mock("@/hooks/use-auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/hooks/use-auth")>("@/hooks/use-auth");
  return {
    ...actual,
    useCurrentRole: () => ({ isLoading: false, data: undefined }),
    useMyClinics: () => ({ data: { clinics: [] }, isLoading: false }),
  };
});

import { Router as AppRouter } from "@/App";

const CLINIC_ID = "clinic-1";

function renderAt(path: string) {
  const { hook, history } = memoryLocation({ path, record: true });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <WouterRouter hook={hook}>
        <AppRouter />
      </WouterRouter>
    </QueryClientProvider>,
  );
  return { history };
}

const current = (history: string[]) => history[history.length - 1];

// [legacy URL module segment, canonical panel section (may include query)]
const LEGACY_MODULES: Array<[string, string]> = [
  ["delegacao", "diagnostico?aba=delegacao"],
  ["riscos", "riscos"],
  ["acao", "acao"],
  ["processos", "processos"],
  ["evidencias", "evidencias"],
  ["documentos", "documentos"],
  ["kickoff", "kickoff"],
  ["equipe", "equipe"],
  ["rede-externa", "rede-externa"],
];

describe("Legacy portal links land in the unified panel", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    localStorage.clear();
  });

  it.each(LEGACY_MODULES)(
    "/portal/%s/:clinicId -> /portal/clinica/:clinicId/%s",
    async (modulo, secao) => {
      const { history } = renderAt(`/portal/${modulo}/${CLINIC_ID}`);

      await waitFor(() =>
        expect(current(history)).toBe(
          `/portal/clinica/${CLINIC_ID}/${secao}`,
        ),
      );
    },
  );

  it("unknown panel section -> falls back to the panel hub", async () => {
    const { history } = renderAt(
      `/portal/clinica/${CLINIC_ID}/secao-inexistente`,
    );

    await waitFor(() =>
      expect(current(history)).toBe(`/portal/clinica/${CLINIC_ID}`),
    );
  });
});
