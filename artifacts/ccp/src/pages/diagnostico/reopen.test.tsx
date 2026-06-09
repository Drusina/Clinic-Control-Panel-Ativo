import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Capture toast() so we can assert the "reaberto" confirmation surfaced.
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

// getStoredToken just reads localStorage; stub it so apiFetch builds a header.
vi.mock("@/hooks/use-auth", () => ({
  getStoredToken: () => "test-token",
}));

// Pin the route param + a no-op navigate so the page resolves a diagnostic id
// without a real router.
const DIAG = "diag-1";
const CLINIC = "clinic-1";
vi.mock("wouter", () => ({
  useParams: () => ({ id: DIAG }),
  useLocation: () => ["/portal/diagnostico/diag-1/resultado", vi.fn()],
}));

// Recharts needs a real layout box (absent in jsdom) and is irrelevant to the
// reopen behavior under test — stub it to keep the render deterministic.
vi.mock("recharts", () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    RadarChart: Stub,
    PolarGrid: Stub,
    PolarAngleAxis: Stub,
    Radar: Stub,
    ResponsiveContainer: Stub,
    Legend: Stub,
    Tooltip: Stub,
  };
});

import DiagnosticoResultado from "./resultado";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function diagnosticPayload(status: string) {
  return {
    id: DIAG,
    clinicId: CLINIC,
    versao: 1,
    status,
    scoreGlobal: 3.5,
    scoresPilares: { estrategia: 3.5 },
    metasPilares: { estrategia: 4 },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
// Mutable status returned by GET /diagnostics/:id. The reopen POST flips it,
// mirroring the backend so the page's post-mutation refetch sees the change.
let currentStatus: string;
let reopenCalls: string[];

beforeEach(() => {
  toastSpy.mockClear();
  currentStatus = "concluido";
  reopenCalls = [];

  fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
    const u = String(url);
    const json = (body: unknown) => ({ ok: true, json: async () => body });

    if (u.includes(`/api/diagnostics/${DIAG}/reopen`)) {
      reopenCalls.push(u);
      expect(opts?.method).toBe("POST");
      currentStatus = "em_andamento"; // backend sets status + clears concluidoEm
      return json({ ...diagnosticPayload("em_andamento"), concluidoEm: null });
    }
    if (u.includes(`/api/diagnostics/${DIAG}/respostas`)) {
      return json([]);
    }
    if (u.includes(`/api/diagnostics/${DIAG}`)) {
      return json(diagnosticPayload(currentStatus));
    }
    if (u.includes("/api/perguntas")) {
      return json([]);
    }
    if (u.includes(`/api/clinics/${CLINIC}`)) {
      return json({ id: CLINIC, nome: "Clinica Teste" });
    }
    return json({});
  });

  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Diagnostic 'Reabrir' (reopen) flow", () => {
  it("shows the reopen button + concluded status once the diagnostic loads", async () => {
    renderWithClient(<DiagnosticoResultado />);

    // The page must render without an error boundary even before scores resolve.
    expect(
      await screen.findByRole("button", { name: /reabrir relatório/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/· concluido/i)).toBeInTheDocument();
  });

  it("opens a confirmation dialog before reopening", async () => {
    const user = userEvent.setup();
    renderWithClient(<DiagnosticoResultado />);

    await user.click(
      await screen.findByRole("button", { name: /reabrir relatório/i }),
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Reabrir diagnóstico?")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /^reabrir$/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /cancelar/i })).toBeInTheDocument();

    // Nothing is sent while only the dialog is open.
    expect(reopenCalls).toHaveLength(0);
  });

  it("reopens on confirm: calls the endpoint, flips status to 'em andamento', and hides the button", async () => {
    const user = userEvent.setup();
    renderWithClient(<DiagnosticoResultado />);

    await user.click(
      await screen.findByRole("button", { name: /reabrir relatório/i }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /^reabrir$/i }));

    // The reopen endpoint was hit exactly once.
    await waitFor(() => expect(reopenCalls).toHaveLength(1));
    expect(reopenCalls[0]).toContain(`/api/diagnostics/${DIAG}/reopen`);

    // Success confirmation telling the user answers are editable again.
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    const toastArg = toastSpy.mock.calls.at(-1)![0];
    expect(toastArg.title).toMatch(/reaberto/i);
    expect(toastArg.description).toMatch(/editar as respostas/i);

    // After the post-mutation refetch the header shows "em_andamento" and the
    // reopen button disappears (it only renders while status is "concluido").
    await waitFor(() => expect(screen.getByText(/· em_andamento/i)).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: /reabrir relatório/i }),
    ).not.toBeInTheDocument();
  });
});
