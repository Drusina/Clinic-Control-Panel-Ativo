import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * Unified "Painel da Clínica" — slim chrome contract.
 *
 * After the panel landed, PortalLayout is just global chrome: the active
 * clinic (+ "Trocar clínica" for 2+ managers), Notificações, Preferências
 * and Sair. Modules NO LONGER live in the chrome — they navigate inside the
 * panel. These tests assert (1) no module label ever leaks into the chrome,
 * (2) the clinic switcher only appears for 2+ managers while single-clinic
 * managers get a static clinic label, and (3) the session-scoped
 * (sessionStorage, never localStorage) active-clinic contract still holds.
 *
 * Unlike layout.test.tsx (which stubs the whole use-auth module), this suite
 * keeps the REAL getActiveClinicId/setActiveClinicId so the session-vs-local
 * storage contract is exercised end-to-end through PortalLayout.
 */

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  logoutMock: vi.fn(() => Promise.resolve()),
  location: "/portal",
  clinics: [] as Array<{ id: string; nome: string; fantasia?: string | null }>,
}));

vi.mock("wouter", () => ({
  useLocation: () => [mocks.location, mocks.navigateMock] as const,
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

// Keep the REAL session-scoped storage helpers; only stub the data/logout
// hooks so we don't need a QueryClient or network.
vi.mock("@/hooks/use-auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/hooks/use-auth")>("@/hooks/use-auth");
  return {
    ...actual,
    useMyClinics: () => ({ data: { clinics: mocks.clinics } }),
    useLogout: () => mocks.logoutMock,
  };
});

import { PortalLayout } from "./portal-layout";
import { getActiveClinicId, setActiveClinicId } from "@/hooks/use-auth";

const ACTIVE_CLINIC_KEY = "ccp_active_clinic_id";

const CLINICS = [
  { id: "clinic-1", nome: "Clínica Alpha" },
  { id: "clinic-2", nome: "Clínica Beta" },
];

// Module labels must NEVER appear in the chrome anymore — they live in the
// panel hub. Includes the old sidebar group names plus module titles.
const MODULE_LABELS = [
  "Operacional",
  "Complementar",
  "Delegação",
  "Mapa de Riscos",
  "Plano de Ação",
  "Processos",
  "Evidências",
  "Documentos",
  "Kickoff",
  "Equipe Interna",
];

function expectNoModuleLabels() {
  for (const label of MODULE_LABELS) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
}

describe("PortalLayout — slim chrome for the unified panel", () => {
  beforeEach(() => {
    mocks.navigateMock.mockClear();
    mocks.logoutMock.mockClear();
    mocks.location = "/portal";
    mocks.clinics = [];
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("setActiveClinicId writes to sessionStorage and never localStorage", () => {
    // Even a pre-existing localStorage value is purged on write.
    localStorage.setItem(ACTIVE_CLINIC_KEY, "stale");
    setActiveClinicId("clinic-1");

    expect(sessionStorage.getItem(ACTIVE_CLINIC_KEY)).toBe("clinic-1");
    expect(localStorage.getItem(ACTIVE_CLINIC_KEY)).toBeNull();
    expect(getActiveClinicId()).toBe("clinic-1");

    setActiveClinicId(null);
    expect(sessionStorage.getItem(ACTIVE_CLINIC_KEY)).toBeNull();
    expect(getActiveClinicId()).toBeNull();
  });

  it("never renders module navigation in the chrome (2+ manager)", () => {
    mocks.clinics = CLINICS;
    mocks.location = "/portal/clinica/clinic-2/delegacao";
    setActiveClinicId("clinic-2");

    render(
      <PortalLayout>
        <div>conteúdo</div>
      </PortalLayout>,
    );

    expectNoModuleLabels();
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
    expect(screen.getByTestId("portal-logout-button")).toBeInTheDocument();
  });

  it("never renders module navigation in the chrome (single-clinic manager)", () => {
    mocks.clinics = [CLINICS[0]];
    mocks.location = "/portal/clinica/clinic-1";

    render(
      <PortalLayout>
        <div>conteúdo</div>
      </PortalLayout>,
    );

    expectNoModuleLabels();
    expect(screen.getByTestId("portal-logout-button")).toBeInTheDocument();
  });

  it("shows the clinic switcher only for a 2+ manager, with the active clinic name", () => {
    mocks.clinics = CLINICS;
    mocks.location = "/portal/clinica/clinic-2";
    setActiveClinicId("clinic-2"); // explicit pick → sessionStorage

    render(
      <PortalLayout>
        <div>conteúdo</div>
      </PortalLayout>,
    );

    const trocar = screen.getByTestId("portal-trocar-clinica");
    expect(trocar).toBeInTheDocument();
    expect(trocar).toHaveTextContent("Clínica Beta");
    expect(screen.queryByTestId("portal-active-clinic")).not.toBeInTheDocument();
  });

  it("shows a static clinic label (no switcher) for a single-clinic manager", () => {
    mocks.clinics = [CLINICS[0]];
    mocks.location = "/portal/clinica/clinic-1";

    render(
      <PortalLayout>
        <div>conteúdo</div>
      </PortalLayout>,
    );

    const active = screen.getByTestId("portal-active-clinic");
    expect(active).toBeInTheDocument();
    expect(active).toHaveTextContent("Clínica Alpha");
    expect(
      screen.queryByTestId("portal-trocar-clinica"),
    ).not.toBeInTheDocument();
  });

  it("resolves the active clinic from a UUID URL even with a hyphenated section", () => {
    const uuid = "11111111-2222-4333-8444-555566667777";
    mocks.clinics = [
      { id: uuid, nome: "Clínica UUID" },
      { id: "clinic-2", nome: "Clínica Beta" },
    ];
    // No stored selection; the UUID-shaped id must be read from the URL and
    // the hyphenated "rede-externa" section must not break the lookup.
    mocks.location = `/portal/clinica/${uuid}/rede-externa`;

    render(
      <PortalLayout>
        <div>conteúdo</div>
      </PortalLayout>,
    );

    const trocar = screen.getByTestId("portal-trocar-clinica");
    expect(trocar).toBeInTheDocument();
    expect(trocar).toHaveTextContent("Clínica UUID");
  });
});
