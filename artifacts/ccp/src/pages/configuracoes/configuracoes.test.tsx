import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * `/configuracoes` — shared settings page (Task #293 T5).
 *
 * Replaces the old NotificationPreferencesModal opened from the sidebars.
 * Contract: two tabs (notification preferences + account data); the account
 * tab surfaces the current session's nome/email/role and a "Trocar senha"
 * action; only team members get the "Minhas clínicas" shortcut. Unauthenticated
 * sessions are bounced to /entrar.
 */

const mocks = vi.hoisted(() => ({
  user: undefined as
    | undefined
    | { role: string | null; nome: string | null; email: string | null },
  isLoading: false,
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div>,
}));

vi.mock("@/components/notification-preferences-panel", () => ({
  NotificationPreferencesPanel: () => <div data-testid="prefs-panel">panel</div>,
}));

vi.mock("@/hooks/use-auth", () => ({
  useCurrentRole: () => ({ data: mocks.user, isLoading: mocks.isLoading }),
}));

import ConfiguracoesPage from "./index";

describe("ConfiguracoesPage", () => {
  beforeEach(() => {
    mocks.user = undefined;
    mocks.isLoading = false;
  });

  afterEach(() => {
    cleanup();
  });

  it("redirects an unauthenticated session to /entrar", () => {
    mocks.user = { role: null, nome: null, email: null };
    render(<ConfiguracoesPage />);
    expect(screen.getByTestId("redirect")).toHaveTextContent("/entrar");
  });

  it("renders both tabs with the notification panel on the default tab", () => {
    mocks.user = { role: "super_admin", nome: "Admin", email: "admin@x.com" };
    render(<ConfiguracoesPage />);

    expect(screen.getByTestId("tab-notificacoes")).toBeInTheDocument();
    expect(screen.getByTestId("tab-conta")).toBeInTheDocument();
    expect(screen.getByTestId("prefs-panel")).toBeInTheDocument();
  });

  it("shows the account data and hides 'Minhas clínicas' for a super_admin", async () => {
    const user = userEvent.setup();
    mocks.user = { role: "super_admin", nome: "Admin Geral", email: "admin@x.com" };
    render(<ConfiguracoesPage />);

    await user.click(screen.getByTestId("tab-conta"));

    expect(screen.getByTestId("conta-nome")).toHaveTextContent("Admin Geral");
    expect(screen.getByTestId("conta-email")).toHaveTextContent("admin@x.com");
    expect(screen.getByTestId("conta-perfil")).toHaveTextContent("Super administrador");
    expect(screen.getByText("Trocar senha")).toBeInTheDocument();
    expect(screen.queryByText("Minhas clínicas")).not.toBeInTheDocument();
  });

  it("shows 'Minhas clínicas' and the gestor role for a team_member", async () => {
    const user = userEvent.setup();
    mocks.user = { role: "team_member", nome: "Gestora", email: "g@x.com" };
    render(<ConfiguracoesPage />);

    await user.click(screen.getByTestId("tab-conta"));

    expect(screen.getByTestId("conta-perfil")).toHaveTextContent("Gestor de clínica");
    expect(screen.getByText("Minhas clínicas")).toBeInTheDocument();
  });
});
