import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

/**
 * Task #5 — "Portal: nunca exibir outras clínicas ao gestor".
 *
 * A logged-in GESTOR (team_member) must NEVER see a list/selector of other
 * clinics in a portal module. When they hit a module with no clinic in the URL,
 * the page's <ClinicSelector> must auto-scope them to their active clinic (or
 * send them to the /me/clinicas chooser) and must never render the clinic list
 * — not even for a frame while the role is still loading.
 *
 * The clinic list may only ever render for a confirmed super_admin. We exercise
 * the real page entry (DelegacaoPage with no clinicId → ClinicSelector), which
 * is the canonical implementation shared by all 7 portal modules.
 */

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  role: undefined as undefined | { role: string },
  activeClinicId: null as string | null,
  clinics: [] as Array<{ id: string; nome: string; cidade?: string | null; uf?: string | null }>,
  clinicsLoading: false,
}));

vi.mock("wouter", () => ({
  // No clinicId in the URL → DelegacaoPage renders <ClinicSelector/>.
  useParams: () => ({}),
  useLocation: () => ["/portal/delegacao", mocks.navigateMock] as const,
  useSearch: () => "",
}));

vi.mock("@/hooks/use-auth", () => ({
  getStoredToken: () => null,
  useCurrentRole: () => ({ data: mocks.role }),
  getActiveClinicId: () => mocks.activeClinicId,
}));

vi.mock("@/hooks/use-clinics-for-current-user", () => ({
  useClinicsForCurrentUser: () => ({
    clinics: mocks.clinics,
    isLoading: mocks.clinicsLoading,
  }),
}));

import DelegacaoPage from "./index";

const CLINICS = [
  { id: "clinic-1", nome: "Clínica Alpha", cidade: "São Paulo", uf: "SP" },
  { id: "clinic-2", nome: "Clínica Beta", cidade: "Rio de Janeiro", uf: "RJ" },
];

function expectNoClinicListRendered() {
  expect(screen.queryByText("Clínica Alpha")).not.toBeInTheDocument();
  expect(screen.queryByText("Clínica Beta")).not.toBeInTheDocument();
}

describe("Portal module clinic-scoping (gestor never sees other clinics)", () => {
  beforeEach(() => {
    mocks.navigateMock.mockClear();
    mocks.role = undefined;
    mocks.activeClinicId = null;
    mocks.clinics = [];
    mocks.clinicsLoading = false;
  });

  afterEach(() => {
    cleanup();
  });

  it("never flashes the clinic list while the role is still loading", () => {
    // Role unresolved (user undefined) but clinics already loaded — the classic
    // flash window. The list must NOT render and we must NOT redirect yet.
    mocks.role = undefined;
    mocks.clinics = CLINICS;

    render(<DelegacaoPage />);

    expectNoClinicListRendered();
    expect(mocks.navigateMock).not.toHaveBeenCalled();
  });

  it("scopes a team_member with an active clinic straight into it, showing no list", async () => {
    mocks.role = { role: "team_member" };
    mocks.activeClinicId = "clinic-2";
    mocks.clinics = CLINICS;

    render(<DelegacaoPage />);

    await waitFor(() =>
      expect(mocks.navigateMock).toHaveBeenCalledWith("/portal/delegacao/clinic-2", {
        replace: true,
      })
    );
    expectNoClinicListRendered();
  });

  it("auto-enters the only clinic of a team_member with no active selection", async () => {
    mocks.role = { role: "team_member" };
    mocks.activeClinicId = null;
    mocks.clinics = [CLINICS[0]];

    render(<DelegacaoPage />);

    await waitFor(() =>
      expect(mocks.navigateMock).toHaveBeenCalledWith("/portal/delegacao/clinic-1", {
        replace: true,
      })
    );
    expectNoClinicListRendered();
  });

  it("sends a team_member with 2+ clinics and no active selection to the chooser", async () => {
    mocks.role = { role: "team_member" };
    mocks.activeClinicId = null;
    mocks.clinics = CLINICS;

    render(<DelegacaoPage />);

    await waitFor(() =>
      expect(mocks.navigateMock).toHaveBeenCalledWith("/me/clinicas", { replace: true })
    );
    expectNoClinicListRendered();
  });

  it("renders the clinic list only for a confirmed super_admin", () => {
    mocks.role = { role: "super_admin" };
    mocks.clinics = CLINICS;

    render(<DelegacaoPage />);

    expect(screen.getByText("Clínica Alpha")).toBeInTheDocument();
    expect(screen.getByText("Clínica Beta")).toBeInTheDocument();
    expect(mocks.navigateMock).not.toHaveBeenCalled();
  });
});
