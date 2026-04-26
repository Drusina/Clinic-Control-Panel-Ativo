# API Server

Express + Drizzle backend for the CCP IONEX platform.

## Required environment variables / secrets

Set these in **Replit → Deployments → Secrets** before deploying. (For local
dev, the workflow loads them from your workspace env.)

### `SUPER_ADMIN_SECRET` (required)

The shared password used to log in to the platform as the **Super Admin** role
via `POST /api/auth/login`.

- **Required.** The server refuses to start if this is unset or empty.
- Treat it like a password. Anyone with this value can administer every clinic.
- Use a strong random value (32+ characters).

### `TOKEN_SIGNING_SECRET` (recommended, but auto-bootstraps)

The HMAC key used to sign and verify session JWTs (`signToken` /
`verifyToken`). It is **separate from `SUPER_ADMIN_SECRET`** so that a leaked
admin password cannot be used to forge session tokens, and vice-versa.

Behavior on boot (see `src/lib/token-secret.ts`):

1. If `TOKEN_SIGNING_SECRET` is set, non-empty, and **different from**
   `SUPER_ADMIN_SECRET`, it is used directly.
2. Otherwise, the server falls back to a value stored in the
   `server_config` table under the key `token_signing_secret`. This value
   is preserved across restarts so existing sessions stay valid.
3. If no DB-stored value exists yet, the server generates a strong random
   secret on first boot and persists it to `server_config`. A clear warning
   is logged so operators know the bootstrap happened.

The server only **fails to start** in the third path if the database is
unreachable (so neither the env var nor the DB fallback is available). In
that case the log message tells you exactly what to set and how.

> **Important:** `TOKEN_SIGNING_SECRET` must NOT equal `SUPER_ADMIN_SECRET`.
> If you set both to the same value, the env var is rejected and the DB
> fallback is used instead — the deploy will not crash, but you will see a
> warning in the logs until you fix it.

### Generating good values

Both secrets should be at least 32 characters of cryptographic randomness.
Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Run the command twice to get two distinct values, then set them as
`SUPER_ADMIN_SECRET` and `TOKEN_SIGNING_SECRET`.

### Rotating `TOKEN_SIGNING_SECRET`

Rotating this secret invalidates every active user session (everyone has to
log in again). To rotate:

- If the value lives in the env var: change `TOKEN_SIGNING_SECRET` in
  Deployments → Secrets and re-deploy.
- If the value lives in `server_config` (auto-bootstrapped): delete the
  `token_signing_secret` row from the `server_config` table and restart the
  server. A new secret will be bootstrapped on the next boot.

## Other environment variables

The server also reads `PORT` (provided by the runtime), `DATABASE_URL` (via
`@workspace/db`), and optional integration keys (Anthropic, OpenAI, web-push
VAPID, Autentique, Google Cloud Storage). Those are documented alongside the
features that use them.
