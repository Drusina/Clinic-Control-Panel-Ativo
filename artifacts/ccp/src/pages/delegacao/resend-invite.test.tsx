import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Capture toast() calls so we can assert the destination e-mail surfaced to the
// user after a (re)send.
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

// getStoredToken just reads localStorage; stub it so authFetch builds a header.
vi.mock("@/hooks/use-auth", () => ({
  getStoredToken: () => "test-token",
}));

import {
  ResendInviteMenu,
  SendInviteButton,
  type DelegacaoResendTarget,
} from "./resend-invite";

const CLINIC = "clinic-1";
const DIAG = "diag-1";

function makeDeleg(overrides: Partial<DelegacaoResendTarget>): DelegacaoResendTarget {
  return {
    id: "id",
    responsavelNome: null,
    responsavelEmail: null,
    inviteSentAt: null,
    questaoInicio: null,
    questaoFim: null,
    ...overrides,
  };
}

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const n1 = makeDeleg({
  id: "n1-estrategia",
  responsavelNome: "Ana Responsavel",
  responsavelEmail: "ana.pilar@example.com",
});
const brunoSub = makeDeleg({
  id: "n2-bruno",
  responsavelNome: "Bruno SubA",
  responsavelEmail: "bruno.sub@example.com",
  questaoInicio: 1,
  questaoFim: 5,
});
const carlaSemEmail = makeDeleg({
  id: "n2-carla",
  responsavelNome: "Carla SemEmail",
  responsavelEmail: null,
  questaoInicio: 6,
  questaoFim: 10,
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  toastSpy.mockClear();
  fetchMock = vi.fn(async (_url: string) => ({
    ok: true,
    json: async () => ({
      ok: true,
      sent: true,
      to: "bruno.sub@example.com",
      link: "https://app.example/responder?code=abc",
    }),
  }));
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ResendInviteMenu — pilar WITH sub-delegations", () => {
  it("shows a 'Reenviar' dropdown trigger (not a single button)", () => {
    renderWithClient(
      <ResendInviteMenu
        clinicId={CLINIC}
        diagnosticoId={DIAG}
        n1={n1}
        n2s={[brunoSub, carlaSemEmail]}
      />,
    );
    const trigger = screen.getByRole("button", { name: /reenviar/i });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  });

  it("lists the N1 responsible + each N2 sub-delegado, disabling those without e-mail", async () => {
    const user = userEvent.setup();
    renderWithClient(
      <ResendInviteMenu
        clinicId={CLINIC}
        diagnosticoId={DIAG}
        n1={n1}
        n2s={[brunoSub, carlaSemEmail]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /reenviar/i }));

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Reenviar link de resposta para…")).toBeInTheDocument();

    // N1 responsible listed with its e-mail.
    expect(within(menu).getByText("Ana Responsavel")).toBeInTheDocument();
    expect(within(menu).getByText(/ana\.pilar@example\.com/)).toBeInTheDocument();

    // Each N2 sub-delegado listed; Bruno (with scope) and Carla (no e-mail).
    expect(within(menu).getByText("Bruno SubA")).toBeInTheDocument();
    expect(within(menu).getByText(/bruno\.sub@example\.com/)).toBeInTheDocument();
    expect(within(menu).getByText("Carla SemEmail")).toBeInTheDocument();
    expect(within(menu).getByText(/sem e-mail cadastrado/)).toBeInTheDocument();

    // The recipient without an e-mail is disabled; the others are enabled.
    const carlaItem = within(menu).getByText("Carla SemEmail").closest('[role="menuitem"]')!;
    expect(carlaItem).toHaveAttribute("aria-disabled", "true");

    const brunoItem = within(menu).getByText("Bruno SubA").closest('[role="menuitem"]')!;
    expect(brunoItem).not.toHaveAttribute("aria-disabled", "true");
  });

  it("calls send-invite for the EXACT chosen delegation id and toasts the destination e-mail", async () => {
    const user = userEvent.setup();
    renderWithClient(
      <ResendInviteMenu
        clinicId={CLINIC}
        diagnosticoId={DIAG}
        n1={n1}
        n2s={[brunoSub, carlaSemEmail]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /reenviar/i }));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByText("Bruno SubA"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // The request targets Bruno's sub-delegation id, NOT Ana's pilar delegation.
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain(
      `/api/clinics/${CLINIC}/diagnostics/${DIAG}/delegacoes/${brunoSub.id}/send-invite`,
    );
    expect(calledUrl).not.toContain(n1.id);

    // The success toast references the destination e-mail.
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    const toastArg = toastSpy.mock.calls.at(-1)![0];
    expect(toastArg.description).toContain("bruno.sub@example.com");
  });
});

describe("SendInviteButton — pilar WITHOUT sub-delegations", () => {
  it("renders a single plain button (not a dropdown menu trigger)", () => {
    const solo = makeDeleg({
      id: "n1-financeiro",
      responsavelNome: "Diego Solo",
      responsavelEmail: "diego.solo@example.com",
      inviteSentAt: null,
    });
    renderWithClient(
      <SendInviteButton clinicId={CLINIC} diagnosticoId={DIAG} delegacao={solo} />,
    );
    const btn = screen.getByRole("button", { name: /enviar convite/i });
    expect(btn).not.toHaveAttribute("aria-haspopup", "menu");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("posts send-invite for its own delegation id when clicked", async () => {
    const user = userEvent.setup();
    const solo = makeDeleg({
      id: "n1-financeiro",
      responsavelNome: "Diego Solo",
      responsavelEmail: "diego.solo@example.com",
      inviteSentAt: "2026-01-01T00:00:00.000Z",
    });
    renderWithClient(
      <SendInviteButton clinicId={CLINIC} diagnosticoId={DIAG} delegacao={solo} />,
    );

    // inviteSentAt set => label is "Reenviar" (single button, still not a menu).
    const btn = screen.getByRole("button", { name: /reenviar/i });
    expect(btn).not.toHaveAttribute("aria-haspopup", "menu");
    await user.click(btn);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      `/delegacoes/${solo.id}/send-invite`,
    );
  });

  it("disables the button when the responsible has no e-mail", () => {
    const noEmail = makeDeleg({
      id: "n1-noemail",
      responsavelNome: "Sem Email",
      responsavelEmail: null,
    });
    renderWithClient(
      <SendInviteButton clinicId={CLINIC} diagnosticoId={DIAG} delegacao={noEmail} />,
    );
    expect(screen.getByRole("button", { name: /enviar convite/i })).toBeDisabled();
  });
});
