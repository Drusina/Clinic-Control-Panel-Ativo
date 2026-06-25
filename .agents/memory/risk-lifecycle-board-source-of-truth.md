---
name: Risk lifecycle — board is source of truth
description: How a risk's status is derived from its Plano de Ação cards, and the invariant that direct API writes must not contradict the Kanban.
---

A risk that has at least one linked Plano de Ação card (`temCard`) is **board-driven**: its status is derived from the Kanban columns of those cards, never set by hand.

- Aggregation (`statusFromBoard`): all cards `done` → `mitigado`; all `backlog` → `aceito` (tratamento decidido, ainda não iniciado); anything mixed/in-progress → `em_mitigacao`; **no cards → `null`** (board says nothing).
- `aceito` is a **real board-driven status** (all linked cards in backlog). It is NOT retired and must NOT be remapped to `identificado` — that was an old bug. The historical one-shot remap is gone.
- No-card semantics are caller-decided via `reconcileRiskStatus(tx, riskId, { resetWhenNoCards })`: default (manual `PATCH /risks/:id`) **preserves** a deliberately-set manual status on a card-less risk; a board event (`DELETE /actions/:id` removing the last card) passes `resetWhenNoCards:true` → resets to `identificado`.
- `nao_aceito` is the **protected human override** — automation (`reconcileRiskStatus`) skips it; only an explicit Aceitar (`POST /risks/:id/accept`) or a PATCH back clears it.
- Aceitar = create a backlog card linked to the risk (idempotent) + clear `nao_aceito`; status then follows the board (→ `aceito`). Descartar = PATCH `nao_aceito` + required justificativa (also deletes the linked **backlog** card; cards already moved off backlog are preserved).
- `backfillRiskStatuses()` (boot, idempotent, per-risk tx, returns changed count) re-derives only **board-linked** risks. It deliberately does NOT touch card-less rows, so manual no-card statuses survive a restart.

**Why:** Removing the manual status dropdown in the UI is NOT enough. A direct API caller hitting `PATCH /risks/:id` could put a card-linked risk into a status that contradicts its board (e.g. `mitigado` while the card is still in `backlog`). The server boundary must enforce the invariant.

**How to apply:** Any new write path that can change a risk's status (or move/delete a linked card) must re-run `reconcileRiskStatus(tx, riskId)` inside the same transaction after the write, EXCEPT when intentionally setting `nao_aceito`. `PATCH /risks/:id` does this; `PATCH /actions/:id` does it on column moves; `DELETE /actions/:id` does it with `{ resetWhenNoCards: true }` (board event). `accept` locks the risk row (`SELECT ... FOR UPDATE`) so concurrent accepts can't both insert duplicate cards.
