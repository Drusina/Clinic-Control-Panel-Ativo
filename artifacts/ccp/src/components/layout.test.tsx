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
  location: "/me/clinicas",
  search: "",
}));

vi.mock("wouter", () => ({
  useLocation: () => [mocks.location, mocks.navigateMock] as const,
  useSearch: () => mocks.search,
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

import { AppLayout } from "./layout";

const CLINICS = [
  { id: "clinic-1", nome: "Clínica Alpha" },
  { id: "clinic-2", nome: "Clínica Beta" },
];

const MODULE_LABELS = [
  "Painel",
  "Clínicas",
  "Notificações",
  "Diagnóstico",
  "Mapa de riscos",
  "Plano de ação",
  "Reuniões",
  "Delegações",
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
    mocks.location = "/me/clinicas";
    mocks.search = "";
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

    expect(screen.getByText("Painel")).toBeInTheDocument();
    expect(screen.getByText("Clínicas")).toBeInTheDocument();
    expect(screen.getByText("Em breve")).toBeInTheDocument();
  });
});

describe("AppLayout — logout button", () => {
  beforeEach(() => {
    mocks.navigateMock.mockClear();
    mocks.logoutMock.mockClear();
    mocks.role = undefined;
    mocks.activeClinicId = null;
    mocks.clinics = [];
    mocks.location = "/me/clinicas";
    mocks.search = "";
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

/**
 * Task #339 — the super-admin shell is a URL-driven two-mode chrome:
 *
 *   • Platform mode (default): platform nav (Painel/Clínicas/Notificações…)
 *     and NO clinic banner. Platform routes (`/`, `/admin/clinicas`, templates,
 *     configurações…) ALWAYS render platform chrome — even if a clinic is still
 *     stored as "active" — because the mode is decided by the URL, not storage.
 *   • Clinic mode: entered only when the route itself carries an accessible
 *     clinic id (e.g. `/admin/clinicas/<uuid>`). It swaps the sidebar for the
 *     clinic-scoped nav and pins the "Você está em: <clinic>" banner with the
 *     "Trocar de clínica" / "Sair para a plataforma" affordances.
 *
 * Clinic ids must look like a uuid/hex slug so they match the layout's
 * `clinicIdFromPath` regex (a plain "clinic-1" would not).
 */
const CLINIC_UUID = "aaaaaaaa-1111-2222-3333-444444444444";
const TWO_MODE_CLINICS = [
  { id: CLINIC_UUID, nome: "Clínica Gamma", fantasia: "Gamma Saúde" },
  { id: "bbbbbbbb-1111-2222-3333-444444444444", nome: "Clínica Delta" },
];

describe("AppLayout — super_admin two-mode shell (platform vs clinic)", () => {
  beforeEach(() => {
    mocks.navigateMock.mockClear();
    mocks.logoutMock.mockClear();
    mocks.role = { role: "super_admin" };
    mocks.activeClinicId = null;
    mocks.clinics = TWO_MODE_CLINICS;
    mocks.location = "/";
    mocks.search = "";
  });

  afterEach(() => {
    cleanup();
  });

  it("renders platform chrome (no clinic banner) on the platform dashboard route", () => {
    mocks.location = "/";

    render(
      <AppLayout>
        <div>conteúdo</div>
      </AppLayout>,
    );

    expect(screen.getByTestId("nav-painel")).toBeInTheDocument();
    expect(screen.getByTestId("nav-clinicas")).toBeInTheDocument();
    expect(screen.queryByTestId("clinic-context-banner")).not.toBeInTheDocument();
  });

  it("keeps platform chrome on a platform route even when a clinic is stored active", () => {
    // The mode is URL-driven: a stored active clinic must NOT flip platform
    // routes into clinic mode.
    mocks.location = "/admin/clinicas";
    mocks.activeClinicId = CLINIC_UUID;

    render(
      <AppLayout>
        <div>conteúdo</div>
      </AppLayout>,
    );

    expect(screen.getByTestId("nav-painel")).toBeInTheDocument();
    expect(screen.queryByTestId("clinic-context-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("exit-to-platform")).not.toBeInTheDocument();
  });

  it("renders clinic chrome + banner when the URL carries an accessible clinic id", () => {
    mocks.location = `/admin/clinicas/${CLINIC_UUID}`;
    mocks.search = "tab=overview";

    render(
      <AppLayout>
        <div>conteúdo</div>
      </AppLayout>,
    );

    // The fixed clinic banner appears with the clinic's name + exit affordance.
    const banner = screen.getByTestId("clinic-context-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent("Gamma Saúde");
    expect(screen.getByTestId("exit-to-platform")).toBeInTheDocument();

    // Clinic-scoped nav replaces the platform nav.
    expect(screen.queryByTestId("nav-painel")).not.toBeInTheDocument();
    expect(screen.getAllByText("Diagnóstico").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Plano de ação").length).toBeGreaterThan(0);
  });

  it("clinic-mode nav links and the 'Sair para a plataforma' button stay under the clinic", () => {
    mocks.location = `/admin/clinicas/${CLINIC_UUID}`;
    mocks.search = "tab=overview";

    render(
      <AppLayout>
        <div>conteúdo</div>
      </AppLayout>,
    );

    // Every clinic-scoped nav anchor keeps the `/admin/clinicas/:id` base.
    const diagnosticoLinks = screen
      .getAllByText("Diagnóstico")
      .map((el) => el.closest("a"))
      .filter((a): a is HTMLAnchorElement => a !== null);
    expect(diagnosticoLinks.length).toBeGreaterThan(0);
    for (const a of diagnosticoLinks) {
      expect(a.getAttribute("href")).toContain(`/admin/clinicas/${CLINIC_UUID}`);
    }

    // The delegação deep link stays under the clinic detail route too.
    const delegacaoLink = screen
      .getAllByText("Delegações")
      .map((el) => el.closest("a"))
      .find((a): a is HTMLAnchorElement => a !== null);
    expect(delegacaoLink?.getAttribute("href")).toBe(
      `/admin/clinicas/${CLINIC_UUID}?tab=diagnostics&aba=delegacao`,
    );

    // "Sair para a plataforma" returns to the platform root.
    fireEvent.click(screen.getByTestId("exit-to-platform"));
    expect(mocks.navigateMock).toHaveBeenCalledWith("/");
  });
});
