---
name: Portal dashboard (Home do gestor) test contract & vitest mock gotcha
description: What portal-dashboard.test.tsx pins after the Home do gestor redesign, the vitest partial-mock crash when adding hooks, and the tarefas Equipe/Minhas scope reality.
---

# Portal dashboard (`artifacts/ccp/src/pages/portal/portal-dashboard.tsx`) tests

## Current contract (post "Home do gestor" redesign)
The page is a top-to-bottom manager home, NOT the old KPI/radar "Visão Geral".
The test pins these data-testid anchors and their client-side aggregation:
`painel-clinic-name`, `painel-progresso`, reused `TrilhaStepper` (stubbed),
`painel-plano-acao` (board-stage counters fold `backlog|todo→a_fazer`,
`doing→em_andamento`, `review→revisao`, `done→concluido`; `plano-stage-*`,
`plano-pilar-*` open-only, `plano-ver-board` → `/portal/clinica/:id/acao`),
`painel-tarefas` (`tarefa-status-*`, `tarefa-{id}` rows show parent ação via
`ClinicTarefa.acaoTitulo`, `tarefas-toggle-{equipe|minhas}` with `aria-pressed`),
and grouped `module-card-{secao}` hub tiles with discreet indicators
(diagnostico maturidade X.X/5, riscos "N críticos", acao "N abertas").
**Why:** all numbers must derive from existing hooks — no fabricated data.
**How to apply:** on rewrite, keep these testids + the fold/open-only rules;
a failing assertion is a real regression, not a stale test.

## Tarefas Equipe/Minhas toggle is real in params, cosmetic for team_member
The toggle drives `tarefaParams = minhas ? { mine: true } : {}` into
`useListClinicTarefas`. A test asserts the hook receives `{}` vs `{ mine: true }`.
But the backend (`actions.ts` tarefas route) FORCES `mine=true` for team_member
callers, so for managers both scopes resolve to their own tasks; only super_admin
sees the team-wide list under "Equipe". Default scope is "Equipe".
**Why:** changing that requires an endpoint change (out of the layout-only scope).
**How to apply:** don't "fix" the identical-data behavior in the frontend; it's a
backend decision.

## vitest partial module mock crashes when you add a hook
The test does `vi.mock("@workspace/api-client-react", () => ({ ... }))` listing
ONLY the hooks/query-key fns the page uses. Adding a NEW hook from that same
module makes it `undefined` at runtime → `undefined(...)` throws → EVERY test in
the file fails, even unrelated ones.
**Why:** a manual `vi.mock` factory does not auto-include real exports.
**How to apply:** when the component starts importing a new hook/helper from an
already-mocked module, extend the factory (return `{data, isLoading}` + a stub
query-key fn). Don't weaken assertions to "fix" the failures.

## Removing a hook mid-session → transient HMR "Invalid hook call"
Editing the page to drop a hook (e.g. `useCurrentRole`) changes the hook count
and makes Vite HMR throw "Invalid hook call" in the live browser until a full
reload. It is an HMR artifact, not a real bug — restart the ccp web workflow (or
hard-reload) to clear it; typecheck + tests stay green.
