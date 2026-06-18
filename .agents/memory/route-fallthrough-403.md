---
name: Misleading "super_admin role required" 403 on new routes
description: Why a brand-new clinic-scoped API route can 403 as super-admin-only, and how to fix it
---

# A new clinic-scoped route returning 403 "super_admin role required" = fall-through, not auth

In `artifacts/api-server` the route groups are layered with `router.use(mw, subRouter)`,
which installs `mw` as a GLOBAL layer that runs on every request reaching it. Order is:
`requireClinicAccess` group → `requireAuth` group → `requireSuperAdmin` group. So if a
request is NOT handled by any router in the earlier groups, it keeps flowing down and
eventually hits the `requireSuperAdmin` layer, which rejects a `team_member` with
`403 {"error":"Forbidden: super_admin role required"}`.

**Why this is confusing:** when you ADD a new route to an existing clinic-scoped router
(e.g. `comercialRouter`) and a `team_member` request to it returns that 403 — while a
sibling route in the SAME file works fine for the same user — it looks like an auth bug.
It is not. It means the new route was not matched by its router, so the request fell
through to the super-admin layer. An unmatched route does NOT 404 here because the
global `requireSuperAdmin` layer short-circuits first.

**Most common cause:** the running dev server has stale code and never registered the
new route. Fix: restart the `artifacts/api-server: API Server` workflow. Typecheck does
NOT restart the server.

**Other causes to rule out:** the route path doesn't actually match (wrong param order /
typo), or the route was added to the wrong router instance.

**How to apply:** if a new `team_member`-accessible endpoint 403s as super-admin-only,
first `restart_workflow` the API server and retry; only then suspect path/mount issues.
