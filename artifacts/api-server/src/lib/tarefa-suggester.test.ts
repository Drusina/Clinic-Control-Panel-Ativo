import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { suggestTarefasForAction } from "./tarefa-suggester.js";
import { ICS_ACTIONS } from "./ics-seed.js";
import { sanitizeTarefaTitles } from "./tarefas.js";

// These tests exercise the no-AI fallback path: with no ANTHROPIC_API_KEY the
// suggester must NEVER block and always return a sanitized, non-empty list with
// source "fallback". The AI happy-path requires a live key and is out of scope.
describe("suggestTarefasForAction — fallback path (no AI key)", () => {
  const original = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
  });

  it("returns a generic curated fallback for an unknown action", async () => {
    const res = await suggestTarefasForAction({ titulo: "Ação totalmente inédita zzz" });
    expect(res.source).toBe("fallback");
    expect(res.tarefas.length).toBeGreaterThan(0);
    // Titles only — no responsável/data/status leak through this contract.
    expect(res.tarefas.every((t) => typeof t === "string" && t.length > 0)).toBe(true);
  });

  it("reuses the curated ICS tarefas on an exact titulo+pilar match", async () => {
    const model = ICS_ACTIONS.find((a) => a.tarefas && a.tarefas.length > 0);
    expect(model).toBeTruthy();
    const res = await suggestTarefasForAction({
      titulo: model!.titulo,
      pilarSlug: model!.pilarSlug,
    });
    expect(res.source).toBe("fallback");
    expect(res.tarefas).toEqual(sanitizeTarefaTitles(model!.tarefas));
  });
});
