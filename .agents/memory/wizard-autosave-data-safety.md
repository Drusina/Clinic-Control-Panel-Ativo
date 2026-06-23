---
name: Diagnostic wizard autosave data safety
description: Rules any client-side autosave→compute flow must follow so answers are never silently lost (born from an unrecoverable diagnostic data-loss incident).
---

# Diagnostic wizard autosave must never silently lose data

The diagnostic wizard (`artifacts/ccp/src/pages/diagnostico/wizard.tsx`) is a debounced
client-side autosave (`pendingAnswers` ref → batched POST). A real clinic lost an entire
diagnostic because autosave failed silently and nothing told the user.

**Why:** the bearer token lives in **sessionStorage**, so it can expire/clear mid-session.
When the batch POST then 401'd, the old code swallowed it (generic toast), showed no
persistent state, and still let "calculate scores" run against the server — which had none
of the answers. The data was never persisted and was **unrecoverable** (confirmed absent in
both prod Neon and dev). Do NOT promise recovery/checkpoint-rollback for this class of bug —
rollback only touches dev.

**How to apply** — any autosave-before-compute flow here must keep all four guarantees:
1. **Flush-then-gate-the-compute.** Before any action that reads server-persisted data
   (calculate-scores, finalize), flush pending writes in a loop and **abort** the compute if
   the save fails. Never compute on unsaved data.
2. **Compare-and-delete the buffer.** On save success, remove from the pending buffer only
   the keys whose *current* pending value still equals the value that was sent. Never blanket
   `pending = {}` — a save that started before a newer edit will otherwise erase it and show a
   false "Salvo". Derive the dirty flag from the remaining buffer size.
3. **Merge pending over refetch.** When a query refetch (e.g. after invalidate) hydrates local
   state, overlay unsaved pending edits on top of the server payload so a refetch can't clobber
   in-flight answers.
4. **Make save state visible + handle auth.** Show a persistent saved/dirty/error indicator
   (not a transient toast), distinguish 401/403 as "session expired" with explicit guidance
   (log in again in a new tab), and warn on `beforeunload` while dirty.

Regression coverage lives in `wizard-save.test.tsx` (flush-before-calculate + abort-on-401).
The respondent wizard (`pages/responder/wizard.tsx`) uses invite-code auth, not the
sessionStorage token, so it is lower-risk — but the same four rules apply if it grows autosave.
