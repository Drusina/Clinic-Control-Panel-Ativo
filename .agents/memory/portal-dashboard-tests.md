---
name: Portal dashboard test contract & vitest mock gotcha
description: Why portal-dashboard.test.tsx pins a contract, the vitest module-mock crash when adding hooks, and the recharts/jsdom test constraint.
---

# Portal dashboard (`artifacts/ccp/src/pages/portal/portal-dashboard.tsx`) tests

## Visão Geral contract is pinned — preserve it on any rewrite
`portal-dashboard.test.tsx` pins four data-testid blocks the team_member landing
MUST keep: `painel-progresso`, `painel-ics-status`, `painel-pendencias`,
`painel-contato-principal` (plus pendência derivation from ICS+progress and the
contato empty state). A rewrite that adds operational content must layer on top,
not drop these.
**Why:** turning the hub into an operational panel silently dropped the contract
and broke all 5 tests. **How to apply:** when changing this page, keep the four
blocks + their exact strings/hrefs; treat the failing test as a real regression,
not a stale test.

## vitest module mock crashes when you add hooks from a mocked module
The test does `vi.mock("@workspace/api-client-react", () => ({ useGetClinic, ... }))`
listing ONLY the hooks the page used at the time. Adding a new hook from that same
module (e.g. `useListRisks`/`useListActions`/`useListDiagnostics`) makes it
`undefined` at runtime → `undefined(...)` throws → EVERY test in the file fails,
even ones unrelated to the new hook.
**Why:** a partial manual `vi.mock` factory does not auto-include real exports.
**How to apply:** when a component starts importing a new hook/helper from an
already-mocked module, extend that mock factory (return empty `{data, isLoading}`
and a stub query-key fn). Don't weaken assertions to "fix" the failures.

## Keep recharts out of jsdom in these tests
Operational tests deliberately use NO concluded diagnostic so the radar renders
its EmptyState branch instead of recharts `ResponsiveContainer` (needs sizing /
ResizeObserver that jsdom lacks). KPI/aggregation assertions (risk counts,
overdue, completion %, próximas-ações ordering) render independently of recharts,
so they're tested with risks/actions data but empty diagnostics.
