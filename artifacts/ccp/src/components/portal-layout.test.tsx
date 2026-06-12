import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * Task #7 — "Forçar escolha de clínica por sessão".
 *
 * The portal's active clinic is session-scoped (sessionStorage). A manager
 * with 2+ clinics must pick a clinic each new browser session: a clinic id
 * left behind in localStorage by an older build must NOT auto-unlock the
 * Operacional/Complementar modules. After an explicit pick (which lands in
 * sessionStorage via setActiveClinicId) the modules unlock and their links
 * carry the selected clinic id — never a hardcoded one. A single-clinic
 * manager still resolves automatically and never sees the chooser.
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

vi.mock("@/components/notification-preferences-modal", () => ({
  NotificationPreferencesModal: () => null,
}));

import { PortalLayout } from "./portal-layout";
import { getActiveClinicId, setActiveClinicId } from "@/hooks/use-auth";

const ACTIVE_CLINIC_KEY = "ccp_active_clinic_id";

const CLINICS = [
  { id: "clinic-1", nome: "Clínica Alpha" },
  { id: "clinic-2", nome: "Clínica Beta" },
];

const MODULE_LABELS = [
  "Operacional",
  "Complementar",
  "Delegação",
  "Mapa de Riscos",
  "Plano de Ação",
  "Processos",
  "Evidências",
  "Documentos",
];

function expectModulesHidden() {
  for (const label of MODULE_LABELS) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
}

describe("PortalLayout — active clinic is session-scoped (Task #7)", () => {
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

  it("ignores a stale localStorage clinic for a 2+ manager — modules stay blocked", () => {
    mocks.clinics = CLINICS;
    // Simulate an older build that persisted the active clinic in localStorage.
    // A new browser session has an empty sessionStorage, so nothing unlocks.
    localStorage.setItem(ACTIVE_CLINIC_KEY, "clinic-2");

    render(
      <PortalLayout>
        <div>conteúdo</div>
      </PortalLayout>,
    );

    expectModulesHidden();
  });

  it("unlocks modules carrying the selected clinic id after an explicit session pick", () => {
    mocks.clinics = CLINICS;
    mocks.location = "/portal/delegacao"; // expands the Operacional section
    setActiveClinicId("clinic-2"); // explicit pick → sessionStorage

    render(
      <PortalLayout>
        <div>conteúdo</div>
      </PortalLayout>,
    );

    expect(screen.getByText("Operacional")).toBeInTheDocument();
    const delegacaoLink = screen.getByText("Delegação").closest("a");
    expect(delegacaoLink?.getAttribute("href")).toBe(
      "/portal/delegacao/clinic-2",
    );
  });

  it("auto-resolves the only clinic for a single-clinic manager", () => {
    mocks.clinics = [CLINICS[0]];
    mocks.location = "/portal/delegacao"; // expands the Operacional section

    render(
      <PortalLayout>
        <div>conteúdo</div>
      </PortalLayout>,
    );

    expect(screen.getByText("Operacional")).toBeInTheDocument();
    const delegacaoLink = screen.getByText("Delegação").closest("a");
    expect(delegacaoLink?.getAttribute("href")).toBe(
      "/portal/delegacao/clinic-1",
    );
  });
});
