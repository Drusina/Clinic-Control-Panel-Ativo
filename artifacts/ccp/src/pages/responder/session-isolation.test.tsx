import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Hoisted mutable state + spies shared between the module mocks and the tests.
const mocks = vi.hoisted(() => ({
  storedTokenRef: { current: null as string | null },
  events: [] as string[],
  logoutMock: vi.fn(),
  clearTokenMock: vi.fn(),
  setActiveClinicIdMock: vi.fn(),
  navigateMock: vi.fn(),
}));

// getStoredToken drives the conflict gate; the rest are teardown spies.
vi.mock("@/hooks/use-auth", () => ({
  getStoredToken: () => mocks.storedTokenRef.current,
  clearToken: mocks.clearTokenMock,
  setActiveClinicId: mocks.setActiveClinicIdMock,
  useLogout: () => mocks.logoutMock,
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/responder", mocks.navigateMock],
}));

import ResponderEntrypoint from "./index";

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ResponderEntrypoint />
    </QueryClientProvider>,
  );
}

let redeemCalls: number;

beforeEach(() => {
  redeemCalls = 0;
  mocks.events.length = 0;
  mocks.storedTokenRef.current = null;
  mocks.logoutMock.mockReset();
  mocks.logoutMock.mockImplementation(async () => {
    mocks.events.push("logout");
    // Mirror the real teardown: the manager token is gone afterwards.
    mocks.storedTokenRef.current = null;
  });
  mocks.clearTokenMock.mockReset();
  mocks.setActiveClinicIdMock.mockReset();
  mocks.navigateMock.mockReset();

  // The invite code lives in the querystring; the entrypoint reads it on mount.
  window.history.pushState({}, "", "/responder?code=test-code");

  const fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    const json = (body: unknown) => ({ ok: true, json: async () => body });
    if (u.includes("/api/auth/responder")) {
      redeemCalls += 1;
      mocks.events.push("redeem");
      return json({
        token: "resp-token",
        clinicId: "clinic-1",
        clinicNome: "Clínica Teste",
        diagnosticoId: "diag-1",
      });
    }
    if (u.includes("/api/respondent/hub")) {
      return json({
        clinicId: "clinic-1",
        clinicNome: "Clínica Teste",
        diagnosticoId: "diag-1",
        diagnosticoStatus: "em_andamento",
        responsavelNome: "Fulano",
        responsavelEmail: "fulano@example.com",
        delegacoes: [],
      });
    }
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Respondent link — session isolation gate", () => {
  it("shows the conflict warning (and does NOT redeem) when a manager session is live", async () => {
    mocks.storedTokenRef.current = "mgr-token";
    renderPage();

    expect(
      await screen.findByText(/Você está logado como gestor/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Continuar como respondente/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Cancelar$/i })).toBeInTheDocument();

    // No respondent session is established while the warning is up.
    expect(redeemCalls).toBe(0);
    expect(mocks.logoutMock).not.toHaveBeenCalled();
    expect(mocks.clearTokenMock).not.toHaveBeenCalled();
  });

  it("on confirm: tears down the manager session BEFORE redeeming the respondent link", async () => {
    const user = userEvent.setup();
    mocks.storedTokenRef.current = "mgr-token";
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Continuar como respondente/i }),
    );

    await waitFor(() => expect(redeemCalls).toBe(1));
    expect(mocks.logoutMock).toHaveBeenCalledTimes(1);
    // Order matters: the privileged session must be gone before the public
    // respondent flow opens.
    expect(mocks.events).toEqual(["logout", "redeem"]);
  });

  it("on cancel: keeps the manager session and navigates home without redeeming", async () => {
    const user = userEvent.setup();
    mocks.storedTokenRef.current = "mgr-token";
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^Cancelar$/i }));

    expect(mocks.navigateMock).toHaveBeenCalledWith("/", { replace: true });
    expect(redeemCalls).toBe(0);
    expect(mocks.logoutMock).not.toHaveBeenCalled();
    expect(mocks.clearTokenMock).not.toHaveBeenCalled();
  });

  it("with no manager session: enters the respondent flow directly (no conflict screen)", async () => {
    mocks.storedTokenRef.current = null;
    renderPage();

    await waitFor(() => expect(redeemCalls).toBe(1));
    expect(
      screen.queryByText(/Você está logado como gestor/i),
    ).not.toBeInTheDocument();
    // Residual privileged state is still hygienically purged on entry.
    expect(mocks.clearTokenMock).toHaveBeenCalled();
    expect(mocks.setActiveClinicIdMock).toHaveBeenCalledWith(null);
  });
});
