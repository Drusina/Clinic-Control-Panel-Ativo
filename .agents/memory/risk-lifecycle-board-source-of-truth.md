---
name: Risk lifecycle — board is source of truth
description: How a risk's status is derived from its Plano de Ação cards, and the invariant that direct API writes must not contradict the Kanban.
---

A risk that has at least one linked Plano de Ação card (`temCard`) is **board-driven**: its status is derived from the Kanban columns of those cards, never set by hand.

- Aggregation (`statusFromBoard`): all cards `done` → `mitigado`; all `backlog` → `identificado`; anything mixed/in-progress → `em_mitigacao`; no cards → `null` (leave manual).
- `nao_aceito` is the **protected human override** — automation (`reconcileRiskStatus`) skips it; only an explicit Aceitar (`POST /risks/:id/accept`) or a PATCH back clears it.
- Aceitar = create a backlog card linked to the risk (idempotent) + clear `nao_aceito`; status then follows the board. Descartar = PATCH `nao_aceito` + required justificativa (also deletes the linked **backlog** card; cards already moved off backlog are preserved).
- Legacy `aceito` status is retired; remapped to `identificado` at boot (`remapLegacyAceitoStatus`, idempotent).

**Why:** Removing the manual status dropdown in the UI is NOT enough. A direct API caller hitting `PATCH /risks/:id` could put a card-linked risk into a status that contradicts its board (e.g. `mitigado` while the card is still in `backlog`). The server boundary must enforce the invariant.

**How to apply:** Any new write path that can change a risk's status (or move a linked card) must re-run `reconcileRiskStatus(tx, riskId)` inside the same transaction after the write, EXCEPT when intentionally setting `nao_aceito`. `PATCH /risks/:id` does this; `PATCH /actions/:id` does it on column moves. `accept` locks the risk row (`SELECT ... FOR UPDATE`) so concurrent accepts can't both insert duplicate cards.
