---
name: Plano de Ação — camadas & multi-responsável
description: Design rules for the Diagnóstico→Risco→Ação redesign — camada derivation, the responsaveis join table, and the standalone Kanban filter pitfall.
---

# Plano de Ação: camada (generation layer) + multi-responsável

## camada is server-authoritative
`acoes.camada` (pontual / consolidada / estrutural) is derived **server-side** from the
pillar average in `diagnostics.scoresPilares` via `camadaForScore` (>3.5 pontual /
2.5–3.5 consolidada / <2.5 estrutural), at BOTH preview and commit. Never trust an
AI- or client-supplied camada. The frontend value is badge-only.

**Why:** AI output and stale client state can't be trusted to bucket severity correctly;
the score is the single source of truth.

## Estrutural = chained phases
Estrutural risks generate top-level `acao_tarefas` chained by self-FK `dependeDeTarefaId`.
The lock is enforced server-side: PATCH a tarefa status to `fazendo`/`concluida` returns
**409** if its dependency isn't `concluida`. The UI mirrors this (disabled status options +
`dependeDeTitulo` banner) but the server is the gate.

## respostaOrigemId resolved at preview, validated at commit
Resposta IDs are resolved at PREVIEW (where indices are valid) and carried through the
contract as `respostaOrigemId`. Commit re-validates each ID ∈ the diagnostic. Never
text-match at commit. `perguntasFonte` snapshots (textual) carry optional `respostaId`/`perguntaId`.

## Multi-responsável via join table
Responsáveis live in `acao_responsaveis` (join table, NOT an array column; unique
`acaoId + lower(email)`). `PUT /actions/:id/responsaveis` replaces the whole set and
validates emails belong to the clinic team. Notifications iterate responsaveis emails and
fall back to the legacy `acoes.responsavelNome`.

**Pitfall:** the standalone Kanban (`pages/acao/index.tsx`) responsável filter must UNION
`responsaveis[]` (names, fallback email) with the legacy `responsavelNome`, both for the
dropdown options and the predicate — otherwise multi-responsável actions silently drop out
of filtered views. The clinic-tab card and detail already read `responsaveis[]`.
