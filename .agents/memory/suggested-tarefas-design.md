---
name: Suggested tarefas are best-effort, never force-injected
description: Why action/risk creation may persist ZERO suggested tarefas, and where the always-non-empty fallback actually lives.
---

# Suggested tarefas (Plano de Ação) — best-effort, editable, never forced

Acoes can be born with suggested tarefas (titles only — no responsável/data/status),
but an empty set is a VALID outcome at every write boundary.

**The rule:**
- `createSuggestedTarefas(tx, acaoId, titles)` inserts nothing when `sanitizeTarefaTitles(titles)` is empty. That is intentional.
- Manual action create (`POST /clinics/:id/actions`) and risk commit persist exactly the tarefas they are given (sanitized/deduped). They do NOT inject a fallback.
- The only place a non-empty list is guaranteed is the suggester endpoint `suggestTarefasForAction` (`POST /clinics/:id/actions/suggest-tarefas`), which always returns a curated/generic fallback with `source:"fallback"` when no AI key / timeout / bad JSON / empty result. The risk-gen AI prompt also explicitly asks for `tarefasSugeridas` per risk, lenient-parsed to `[]` on omission.

**Why:** the design is "hybrid + editable preview". The manager opts in via a "Sugerir com IA" button and can edit/remove every suggestion before saving — force-injecting tarefas server-side would silently override deliberate user edits. And the risk path's documented acceptance is literally "IA falha → ação sem tarefas, sem quebrar": never block creation. So the AI/fallback guarantee belongs to the *suggest* step, not the *write* step.

**How to apply:** if a future review flags "actions can have zero tarefas, that violates 'cada ação nasce com tarefas'", do NOT add a write-boundary fallback — that contradicts the editable-preview model and the risk acceptance. The headline describes the happy path; zero is allowed by design. A test asserting empty input → zero persisted tarefas is correct, not a bug.
