---
name: Authenticating tests/sandbox against the CCP app
description: Why you can't mint a JWT from the sandbox, and the working login path
---

# Authenticating against CCP in tests / code_execution

`viewEnvVars` only returns booleans for secrets — secret plaintext is never
readable. And the HS256 signing key comes from the `TOKEN_SIGNING_SECRET` env var
when it is set (it is), so a JWT minted from the DB `server_config` fallback will
**not** be accepted. Conclusion: do not try to mint tokens or log in as
super_admin from the sandbox.

**Why:** the running server's signing secret is unreadable, so forged/DB-derived
tokens fail verification with 401.

**How to apply (working path):** seed a `team_member` identity and log in via
`POST /api/auth/entrar` (email + password). Create an `equipe_interna` row for the
target clinic with platform access, plus a `team_credentials` row holding a bcrypt
hash of a known password (non-provisional, so the change-password gate doesn't
fire). A team_member with clinic access can drive clinic-scoped screens/endpoints.
For UI runs, `runTest()` logs in through the `/entrar` page.

**Cleanup:** deleting the clinic row cascades its delegations/diagnostics/team
rows; `team_credentials` is keyed by email (not clinic), so delete it separately.

**Note:** the `@workspace/ccp` artifact now has a vitest harness for isolated
component tests — prefer that over a full UI run when locking pure render/handler
logic that doesn't need a real session.

**Backend vitest route tests are the exception — DO mint tokens here.** The
"don't mint tokens" rule above is only about the live server (sandbox/runTest),
whose signing secret is unreadable. In `artifacts/api-server` vitest files you
`vi.mock("../lib/token-secret.js", () => ({ getTokenSigningSecret: () => "<fixed>" }))`
and then call `signToken({ role: "super_admin", sub: "tester" })` to mint a real
token through the production verify path. Mount the router under its real
middleware (`app.use("/api", requireClinicAccess, router)`) and seed clinic rows
directly via `db`. See `kickoffs.test.ts` / `clinic-documents.dedup.test.ts`.
**Why:** mocking the secret makes minted tokens valid, so no DB/login dance is
needed for isolated route tests.

**Gotcha (runTest DB seeding is flaky):** `[DB]` INSERT steps inside a `runTest`
plan are not reliably executed — a run can reach login with the rows never
created, failing as "credenciais inválidas". Seed deterministically yourself via
`executeSql` (generate the UUIDs/email in code), then make the test plan start at
`/entrar` and use read-only `[DB]` only for assertions. Clean up the rows in the
same code_execution afterward, since a crashing plan skips its own cleanup step.
