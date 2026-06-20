import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

/**
 * Task #6 — "Seletor de clínicas: só mostrar escolha, sem módulos".
 *
 * The AppLayout sidebar must NOT expose the operational modules
 * (Diagnóstico 360°, Notificações, Operacional, Complementar) to a
 * team_member. A manager only ever sees the AppLayout chrome on the
 * `/me/clinicas` chooser — TeamMemberToPortal bounces them off every other
 * AppLayout route into `/portal` — so the chooser must offer ONLY the
 * "Minhas clínicas" entry. The bug: a stored/first-clinic fallback used to
 * unlock the module sidebar right there on the chooser.
 *
 * Super-admins keep their full module sidebar.
 */

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  logoutMock: vi.fn(() => Promise.resolve()),
  role: undefined as undefined | { role: string },
  activeClinicId: null as string | null,
  clinics: [] as Array<{ id: string; nome: string; fantasia?: string | null }>,
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/me/clinicas", mocks.navigateMock] as const,
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/hooks/use-auth", () => ({
  useCurrentRole: () => ({ data: mocks.role }),
  useMyClinics: () => ({ data: { clinics: mocks.clinics } }),
  useLogout: () => mocks.logoutMock,
  getActiveClinicId: () => mocks.activeClinicId,
  setActiveClinicId: vi.fn(),
}));

vi.mock("@/components/notification-preferences-modal", () => ({
  NotificationPreferencesModal: () => null,
}));

import { AppLayout } from "./layout";

const CLINICS = [
  { id: "clinic-1", nome: "Clínica Alpha" },
  { id: "clinic-2", nome: "Clínica Beta" },
];

const MODULE_LABELS = [
  "Diagnóstico 360°",
  "Notificações",
  "Operacional",
  "Complementar",
  "Delegação",
  "Mapa de Riscos",
  "Plano de Ação",
  "Processos",
  "Evidências",
  "Documentos",
];

function expectNoModulesRendered() {
  for (const label of MODULE_LABELS) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
}

describe("AppLayout sidebar — team_member never sees modules on the chooser", () => {
  beforeEach(() => {
    mocks.navigateMock.mockClear();
    mocks.logoutMock.mockClear();
    mocks.role = undefined;
    mocks.activeClinicId = null;
    mocks.clinics = [];
  });

  afterEach(() => {
    cleanup();
  });

  it("shows only 'Minhas clínicas' for a team_member with 2 clinics and no active selection", () => {
    mocks.role = { role: "team_member" };
    mocks.activeClinicId = null;
    mocks.clinics = CLINICS;

    render(
      <AppLayout>
        <div>conteúdo</div>
      </AppLayout>,
    );

    expect(screen.getByText("Minhas clínicas")).toBeInTheDocument();
    expectNoModulesRendered();
  });

  it("keeps modules hidden even when a previously-stored clinic is still active", () => {
    // This is the exact regression: the stored clinic used to flip the
    // sidebar into the unlocked module state right on the chooser.
    mocks.role = { role: "team_member" };
    mocks.activeClinicId = "clinic-2";
    mocks.clinics = CLINICS;

    render(
      <AppLayout>
        <div>conteúdo</div>
      </AppLayout>,
    );

    expect(screen.getByText("Minhas clínicas")).toBeInTheDocument();
    expectNoModulesRendered();
  });

  it("renders the full module sidebar for a super_admin", () => {
    mocks.role = { role: "super_admin" };
    mocks.clinics = CLINICS;

    render(
      <AppLayout>
        <div>conteúdo</div>
      </AppLayout>,
    );

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Operacional")).toBeInTheDocument();
    expect(screen.getByText("Complementar")).toBeInTheDocument();
  });
});

describe("AppLayout — logout button", () => {
  beforeEach(() => {
    mocks.navigateMock.mockClear();
    mocks.logoutMock.mockClear();
    mocks.role = undefined;
    mocks.activeClinicId = null;
    mocks.clinics = [];
  });

  afterEach(() => {
    cleanup();
  });

  it("shows 'Sair' for a super_admin and logs out to /admin/login", async () => {
    mocks.role = { role: "super_admin" };
    mocks.clinics = CLINICS;

    render(
      <AppLayout>
        <div>conteúdo</div>
      </AppLayout>,
    );

    const button = screen.getByTestId("logout-button");
    expect(button).toHaveTextContent("Sair");

    fireEvent.click(button);

    await waitFor(() => expect(mocks.logoutMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.navigateMock).toHaveBeenCalledWith("/admin/login"),
    );
  });

  it("shows 'Sair' for a team_member and logs out to /entrar", async () => {
    mocks.role = { role: "team_member" };
    mocks.clinics = CLINICS;

    render(
      <AppLayout>
        <div>conteúdo</div>
      </AppLayout>,
    );

    const button = screen.getByTestId("logout-button");
    expect(button).toHaveTextContent("Sair");

    fireEvent.click(button);

    await waitFor(() => expect(mocks.logoutMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.navigateMock).toHaveBeenCalledWith("/entrar"),
    );
  });
});
