import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Capture toast() so we can assert the session-expired warning surfaced.
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

// apiFetch reads the token; useCurrentRole feeds selfEmail. Stub both.
vi.mock("@/hooks/use-auth", () => ({
  getStoredToken: () => "test-token",
  useCurrentRole: () => ({ data: { email: "admin@test.com" } }),
}));

// The delegate modal is unrelated to autosave and never opens here.
vi.mock("@/components/diagnostic/delegate-questions-modal", () => ({
  DelegateQuestionsModal: () => null,
}));

const DIAG = "diag-1";
const CLINIC = "clinic-1";
const Q1 = "q1";
const navigateSpy = vi.fn();
vi.mock("wouter", () => ({
  useParams: () => ({ id: DIAG }),
  useLocation: () => ["/portal/diagnostico/diag-1", navigateSpy],
}));

import DiagnosticoWizard from "./wizard";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const PILLAR = { slug: "estrategia", nome: "Estratégia", ordem: 1, questionCount: 1 };
const QUESTION = {
  id: Q1,
  pilarSlug: "estrategia",
  pilarNome: "Estratégia",
  pilarOrdem: 1,
  texto: "A clínica tem processos definidos?",
  tipo: "sim_nao",
  peso: 1,
  ordem: 1,
};

let fetchMock: ReturnType<typeof vi.fn>;
// Ordered log of write calls so we can prove the save happens BEFORE the
// score calculation (the exact ordering that the data-loss incident violated).
let callLog: string[];
// When true, the batch-save endpoint replies 401 (expired session).
let batchUnauthorized: boolean;

beforeEach(() => {
  toastSpy.mockClear();
  navigateSpy.mockClear();
  callLog = [];
  batchUnauthorized = false;

  // Enter the pillar view directly via the ?pilar deep-link.
  window.history.pushState({}, "", "/?pilar=estrategia");

  fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
    const u = String(url);
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

    if (u.includes(`/api/diagnostics/${DIAG}/respostas/batch`)) {
      callLog.push("batch");
      expect(opts?.method).toBe("POST");
      if (batchUnauthorized) return { ok: false, status: 401, json: async () => ({}) };
      return ok({ saved: 1 });
    }
    if (u.includes(`/api/diagnostics/${DIAG}/calculate-scores`)) {
      callLog.push("calculate");
      expect(opts?.method).toBe("POST");
      return ok({ scoreGlobal: 3 });
    }
    if (u.includes(`/api/diagnostics/${DIAG}/respostas`)) return ok([]);
    if (u.includes(`/api/diagnostics/${DIAG}`)) return ok({ id: DIAG, clinicId: CLINIC });
    if (u.includes(`/api/diagnostic/pillars/estrategia/questions`)) return ok([QUESTION]);
    if (u.includes(`/api/diagnostic/pillars`)) return ok([PILLAR]);
    if (u.includes(`/api/clinics/${CLINIC}/delegacoes`)) return ok([]);
    return ok({});
  });

  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

describe("Diagnostic wizard — save safeguards before calculate", () => {
  it("flushes the pending answer (batch save) BEFORE calling calculate-scores", async () => {
    const user = userEvent.setup();
    renderWithClient(<DiagnosticoWizard />);

    // Answer the (only) question, then ask for the result.
    await user.click(await screen.findByRole("button", { name: /sim/i }));
    await user.click(await screen.findByRole("button", { name: /ver resultado/i }));

    // calculate-scores must run, and only after the answer was saved.
    await waitFor(() => expect(callLog).toContain("calculate"));
    expect(callLog.indexOf("batch")).toBeGreaterThanOrEqual(0);
    expect(callLog.indexOf("batch")).toBeLessThan(callLog.indexOf("calculate"));

    // On success it navigates to the result page.
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith(`/diagnostico/${DIAG}/resultado`),
    );
  });

  it("aborts calculate-scores and warns when the save fails with 401 (session expired)", async () => {
    batchUnauthorized = true;
    const user = userEvent.setup();
    renderWithClient(<DiagnosticoWizard />);

    await user.click(await screen.findByRole("button", { name: /sim/i }));
    await user.click(await screen.findByRole("button", { name: /ver resultado/i }));

    // The save was attempted but failed → results are NEVER computed on unsaved data.
    await waitFor(() => expect(callLog).toContain("batch"));
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringMatching(/sess[aã]o expirada/i) }),
      ),
    );
    expect(callLog).not.toContain("calculate");
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
