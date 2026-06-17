---
name: Trilha auto-completion
description: How the 15-stage Trilha de Implementação auto-completes data-detectable stages, and what must stay human-driven.
---

# Trilha de Implementação — automatic progression

The clinic-journey Trilha is a FIXED 15-stage list. Progression is now
**automatic** for the data-detectable stages: the signal engine
(`computeSuggestion`) decides if a stage is "pronto" from live module data, and
`reconcileTrilha(clinicId)` concludes it with NO human click (actor recorded as
`"Sistema (automático)"`). If a stage's signal later lapses, reconcile reopens
it (back to `pendente`, clearing dataConcluida/confirmadoPor).

This OVERTURNS the earlier "system suggests, consultant confirms" invariant —
there is no green "Pronto para concluir / Concluir" confirm button anymore.

**Two things stay human-driven:**
- **Manual marcos** (`def.manual === true`: avaliacao, montagem_painel,
  treinamento, acompanhamento) are never auto-derived — only a PATCH concludes
  them, and reconcile never touches them.
- **Human overrides** `bloqueado` / `nao_aplicavel` (the `OVERRIDE_STATUSES`
  set) win even when the signal is `pronto`; reconcile skips them. Only a human
  PATCH back to `pendente` clears an override.

**LGPD special rule:** the `lgpd` stage completes ONLY when all
`TEMPLATE_SLUGS.length` (6) termos are formalized — counted as `lgpd_termos`
rows whose `slug ∈ TEMPLATE_SLUGS` AND `status ∈ ('assinado','anexado')`. Until
then the UI shows an "Aguardando: X de 6 termos formalizados." line (the signal
`motivo`).

`clinics.etapa` (int) and `clinics.progresso` (%) are DERIVED from the rows
(`round(resolvidas/15*100)`, etapa = first non-resolved ordem), recomputed in
the same tx as the transitions — never hand-typed.

**Why:** consultants found the confirm-every-stage step redundant when the data
already proved a stage was done; the product now treats the data as the source
of truth and only asks for a human decision where no data signal exists (manual
marcos) or where a human deliberately overrides.

**How to apply:**
- `reconcileTrilha` is the single source of truth and runs on every GET
  (`loadTrilha` wraps it) and at boot (`backfillTrilha` calls it per clinic). It
  is idempotent — writes only on a real transition or to repair stale clinic
  progress.
- Anything that adds a new auto stage just needs a `computeSuggestion` case; do
  NOT add bespoke conclude logic elsewhere.
- The frontend (`trilha-stepper.tsx`) hides Concluir/Em-andamento/Reabrir for
  non-manual stages; it only offers Bloquear / Não se aplica / Editar (plus
  "Remover marcação" to clear an override). Manual marcos keep all actions.
- Reconcile must stay **concurrency-safe**: guard each transition UPDATE on the
  exact observed status (`WHERE status = from`) and insert the activity row only
  when the update changed a row. Two concurrent GETs must not double-conclude or
  double-log; overrides racing in must win.
- **LGPD gate counts DISTINCT slugs**, not rows — `lgpd_termos` allows multiple
  rows per slug, so a raw `count()` could hit 6 with a required template still
  missing.
- The PATCH route rejects hand-setting a non-manual stage to
  `concluido`/`em_andamento` (reconcile would overturn it); only overrides,
  reopen-to-`pendente`, and metadata edits are allowed there.
- Downstream features (e.g. Agenda) must still NEVER write trilha
  progresso/etapa themselves — reconcile owns that.
- Regression gate: `artifacts/api-server/src/routes/trilha.test.ts`.
