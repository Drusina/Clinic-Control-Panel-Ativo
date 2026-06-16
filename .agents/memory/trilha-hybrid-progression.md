---
name: Trilha hybrid progression
description: The "system suggests, consultant confirms" invariant for the 15-stage Trilha de Implementação and what silently violates it.
---

# Trilha de Implementação — hybrid progression invariant

The clinic-journey Trilha is a FIXED 15-stage list. Progression is HYBRID: the
system only **suggests** a stage is "pronto para concluir" (computed live from
module data); a human consultant **confirms** via PATCH. The system must NEVER
auto-conclude a stage.

`clinics.etapa` (int) and `clinics.progresso` (%) are now **derived** from
confirmed trilha rows (recompute = round(resolvidas/15*100), etapa = first
non-resolved ordem) — NOT hand-typed. Legacy hand-typed values are treated as
unreliable and get overwritten to 0/1 on first materialization until a
consultant confirms stages.

**Why:** A startup backfill that seeded stages as `concluido` from the live
suggestion engine silently violated the "never auto-conclude" rule — it looked
like a migration but was really the system confirming on the consultant's
behalf. Code review caught it as a hard blocker. The trap: anything that writes
status from `computeSuggestion(...).pronto` is auto-concluding, even if it's
labelled "migration".

**How to apply:**
- Only the PATCH route (`PATCH /clinics/:clinicId/trilha/:etapaKey`) may set a
  stage to `concluido`/`nao_aplicavel` and snapshot the suggestion.
- Backfill and the GET materializer must seed rows as `pendente` only, then
  recompute (→ progresso 0 for a fresh clinic). Suggestions are computed in the
  GET response, never persisted by read/backfill paths.
- Regression test `artifacts/api-server/src/routes/trilha.test.ts` is the
  release gate: it asserts GET/backfill stay all-pendente even when the engine
  flags a stage pronto, and PATCH is the only path that concludes + recomputes.
- Downstream features (e.g. Agenda) consuming trilha state must respect the same
  rule: suggest, don't conclude.
