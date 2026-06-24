---
name: Single in-progress diagnostic invariant
description: How "one em_andamento diagnostic per clinic" is enforced and why not via a DB constraint
---

# Single in-progress diagnostic per clinic

The rule "a clinic may have at most one `em_andamento` diagnostic" is enforced
in `POST /clinics/:clinicId/diagnostics` (api-server `routes/diagnostics.ts`):
check-then-insert wrapped in a `db.transaction` with
`pg_advisory_xact_lock(hashtext('create-diagnostic:'+clinicId))` so concurrent
creates / double-clicks serialize. Version = `max(versao)+1` (not count) so
deletes don't reuse numbers. DELETE is conditional on `status='em_andamento'`
(RETURNING) to beat a concurrent "concluir".

**Why not a partial unique index** (`diagnosticos(clinic_id) WHERE
status='em_andamento'`): production already holds clinics with TWO in-progress
diagnostics — that legacy duplicate state is exactly what the delete feature
lets operators clean up. Adding the index now would fail on existing rows. It
becomes viable only AFTER duplicates are cleared (tracked as a follow-up).

**How to apply:** when adding any new path that creates diagnostics, route it
through the same transaction+advisory-lock guard, or the invariant can break.
