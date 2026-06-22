---
name: Risk-generation flow uses hand-written types
description: generate-risks-button.tsx does NOT use Orval-generated types for preview/commit — mirror backend contract changes by hand.
---

# Risk-generation (preview → review → commit) uses hand-written types + raw fetch

`components/riscos/generate-risks-button.tsx` drives the diagnostic→risk preview/commit
flow with **raw `fetch` and locally hand-written TypeScript types**
(`GeneratedRiskPreview`, `CommitRiskItem`, `GeneratedSubtarefa`, `GeneratedFase`,
`PerguntaFonte`) — it deliberately does NOT import the Orval-generated
`GeneratedRiskPreview` / `CommitGeneratedRiskItem` from `@workspace/api-client-react`.

**Why:** the review dialog needs editable client-side state shapes and was built before/around
the generated contract; it talks to `/generate-risks/preview` and `/generate-risks/commit`
directly with a bearer token.

**How to apply:** any change to the preview/commit OpenAPI contract (new plano fields,
camada, pilarScore, perguntasFonte enrichment, etc.) must be mirrored **by hand** in this
component's local types AND the commit body builder (`handleCommitReview`). Typecheck will
NOT catch a drift between the generated schema and these hand-written types. After editing
the contract, grep this file and reconcile it manually.

Server recomputes `camada` from `diagnostics.scoresPilares` at both preview and commit, so the
client never sends `camada` in the commit body (informational/badge only). `subtarefas`/`fases`
ARE carried preview→commit; `respostaOrigemId` inside them is re-validated server-side.
