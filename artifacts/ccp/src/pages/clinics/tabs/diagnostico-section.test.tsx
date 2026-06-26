import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Task #339 — the shared DiagnosticoSection embeds the Diagnósticos +
 * "Delegação & Respostas" sub-tabs and is URL-driven via `?aba=`. When the
 * super-admin clinic detail embeds it, it passes a `basePath` of
 * `/admin/clinicas/:id` so the delegação deep link NEVER escapes the clinic
 * detail route (the portal default would point at `/portal/clinica/:id/...`).
 *
 * These tests pin both deep-link surfaces under the admin base:
 *   • the inner sub-tab switcher (writes `?aba=delegacao` via replace), and
 *   • the per-diagnostic delegação href injected into DiagnosticsTab.
 */

const CLINIC = "aaaaaaaa-1111-2222-3333-444444444444";

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  search: "",
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/admin/clinicas/" + CLINIC, mocks.navigateMock] as const,
  useSearch: () => mocks.search,
}));

// DiagnosticsTab just needs to surface the delegação href it was handed so we
// can assert the deep link target; DelegacaoPage is irrelevant here.
vi.mock("./diagnostics-tab", () => ({
  default: ({
    buildDelegacaoHref,
  }: {
    buildDelegacaoHref: (id: string) => string;
  }) => (
    <a data-testid="delegacao-deep-link" href={buildDelegacaoHref("diag-1")}>
      delegar
    </a>
  ),
}));
vi.mock("@/pages/delegacao/index", () => ({
  default: () => <div data-testid="stub-delegacao-page" />,
}));

import DiagnosticoSection from "./diagnostico-section";

const ADMIN_BASE = `/admin/clinicas/${CLINIC}`;

function renderAdmin() {
  return render(
    <DiagnosticoSection
      clinicId={CLINIC}
      basePath={ADMIN_BASE}
      buildDelegacaoHref={(diagId) =>
        `${ADMIN_BASE}?tab=diagnostics&aba=delegacao&diagnostico=${diagId}`
      }
    />,
  );
}

describe("DiagnosticoSection — admin-embedded deep links stay under /admin/clinicas/:id", () => {
  beforeEach(() => {
    mocks.navigateMock.mockClear();
    mocks.search = "tab=diagnostics";
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps the per-diagnostic delegação href under the admin clinic detail route", () => {
    renderAdmin();
    expect(screen.getByTestId("delegacao-deep-link")).toHaveAttribute(
      "href",
      `${ADMIN_BASE}?tab=diagnostics&aba=delegacao&diagnostico=diag-1`,
    );
  });

  it("switches to the Delegação sub-tab via a replace under the admin base", async () => {
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByTestId("tab-delegacao"));

    const [url, opts] = mocks.navigateMock.mock.calls.at(-1)!;
    expect(url).toBe(`${ADMIN_BASE}?tab=diagnostics&aba=delegacao`);
    expect(opts).toEqual({ replace: true });
  });

  it("reads ?aba=delegacao and activates the Delegação sub-tab", () => {
    mocks.search = "tab=diagnostics&aba=delegacao";
    renderAdmin();
    expect(screen.getByTestId("tab-delegacao")).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByTestId("stub-delegacao-page")).toBeInTheDocument();
  });

  it("drops ?aba= when returning to the Diagnósticos sub-tab (still under admin base)", async () => {
    const user = userEvent.setup();
    mocks.search = "tab=diagnostics&aba=delegacao";
    renderAdmin();

    await user.click(screen.getByTestId("tab-diagnosticos"));

    const [url] = mocks.navigateMock.mock.calls.at(-1)!;
    expect(url).toBe(`${ADMIN_BASE}?tab=diagnostics`);
    expect(url).not.toContain("aba=");
    expect(url.startsWith(ADMIN_BASE)).toBe(true);
  });
});
