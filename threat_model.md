# Threat Model

## Project Overview

IONEX360 is a pnpm-workspace monorepo for a clinic-management CRM. The production system consists of an Express 5 API in `artifacts/api-server`, a React/Vite web app in `artifacts/ccp`, and shared TypeScript libraries in `lib/*` for database schema and generated API types.

The application manages clinics, internal team members, diagnostics, documents, LGPD terms, notifications, and administrative integrations such as Resend, WhatsApp, Autentique, BrasilAPI, OpenAI, and Replit object storage. PostgreSQL is the system of record. Authentication is implemented with custom HMAC-signed bearer tokens derived from a single server secret.

Production assumptions for future scans:
- `NODE_ENV` is `production` in deployed environments.
- Replit deployment terminates TLS for client/server traffic.
- `artifacts/mockup-sandbox` is dev-only and should be ignored unless production reachability is demonstrated.

## Assets

- **Admin authentication secret and session tokens** — `SUPER_ADMIN_SECRET` protects the full admin surface, and the same trust domain governs bearer tokens issued by `artifacts/api-server/src/middleware/auth.ts`. Compromise grants broad control over clinic data and configuration.
- **Clinic operational data** — clinic profiles, diagnostics, risks, action plans, financial/contract metadata, notifications, and team records stored in PostgreSQL. Disclosure can expose sensitive business and personal data.
- **Documents and uploaded files** — contracts, constitutive documents, LGPD terms, and evidence files stored via object storage or external storage integrations. Unauthorized read access exposes confidential clinic records.
- **Integration credentials** — Resend, Autentique, Supabase, WhatsApp, VAPID, and AI API credentials. Exposure enables abuse of external services or compromise of downstream systems.
- **Notification channels and recipient identities** — email addresses, WhatsApp numbers, push subscriptions, and notification history. These can be abused for phishing, spam, or activity disclosure.

## Trust Boundaries

- **Browser to API** — the React frontend and any direct HTTP client call into `/api/*`. The client is untrusted and every request must be authenticated and authorized server-side.
- **Public routes to protected admin routes** — `artifacts/api-server/src/routes/index.ts` mixes public, authenticated, and `requireSuperAdmin`-gated routers. Mounting mistakes here can expose sensitive handlers.
- **Team-member to super-admin boundary** — team-member invite/session tokens exist alongside super-admin tokens. The API must prevent privilege escalation between these roles.
- **API to PostgreSQL** — the API has full database access through Drizzle and raw SQL helpers. Injection or authorization flaws at the API layer expose the entire data store.
- **API to object storage** — the API can mint upload URLs, serve private objects, and generate signed download URLs. Path handling and authorization must prevent arbitrary object access.
- **API to third-party services** — Resend, Autentique, WhatsApp, OpenAI, BrasilAPI, and Supabase are all called from the backend with privileged credentials.
- **Webhook / external caller to API** — Autentique webhook requests cross from an external service into the API and must be validated before changing document state.

## Scan Anchors

- **Production entry points** — `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/index.ts`, `artifacts/ccp/src/main.tsx`, `artifacts/ccp/src/App.tsx`.
- **Highest-risk code areas** — `artifacts/api-server/src/middleware/auth.ts`, `artifacts/api-server/src/routes/auth.ts`, public or mixed-auth routers in `artifacts/api-server/src/routes/`, document/object storage code in `artifacts/api-server/src/routes/storage.ts`, `clinic-documents.ts`, `docs-constitutivos.ts`, and integration/config code in `server-config.ts`, `autentique.ts`, `lib/email.ts`, and `lib/config.ts`.
- **Public vs authenticated vs admin surfaces** — `health`, `auth`, `storage/public-objects`, and `autentique/webhook` are intentionally public; `push` is route-level `requireAuth` and is currently the only reviewed production API surface reachable with `team_member` tokens; most clinic/admin routes rely on the top-level `requireSuperAdmin` mount in `routes/index.ts`.
- **Usually ignore as dev-only** — `artifacts/mockup-sandbox`, build output under `dist/`, scripts used only for local testing/backfills unless production reachability matters.

## Review Notes (2026-04-26)

- **Confirmed hotspots for future scans** — `routes/index.ts` mount boundaries, `middleware/auth.ts` token lifecycle and role scoping, `routes/auth.ts` invite redemption and brute-force protections, `routes/push.ts` subscription identity handling, `artifacts/ccp/src/hooks/use-auth.ts` plus browser-state invalidation on session changes, and upload paths that buffer large request bodies in memory.
- **Validated non-issues in this scan** — mixed public/admin route mounts are currently correct; invite codes are random, hashed at rest, one-time after redemption, and there is no post-redeem replay path; team-member revocation currently blocks new push API use and `sendPushToTeamMember()` re-checks `temAcessoPlataforma` before delivery; private storage signed URLs are path-bound, short-lived, and served as attachment with `nosniff`; `resolveAppUrl()` avoids Host-header poisoning in production by falling back to configured/default origins; `autentiquePublicRouter` fails closed in production when the webhook secret is missing; the app logger strips query strings from first-party request logs; HoundDog returned no findings; the SAST-reported SQL injection high in `clinic-documents.ts` was a false positive on a log string; and the `lib/email.ts` HTML-template findings were not exploitable from production-reachable attacker input.
- **Confirmed findings from this scan** — several large base64 upload routes parse up to 15 MB request bodies before `requireSuperAdmin` runs, enabling unauthenticated memory-exhaustion DoS; delegation push notifications can leak across clinics because `sendPushToEmail()` resolves recipients by bare email with `LIMIT 1` while duplicate team emails are allowed across clinics; push subscriptions survive role changes on reused browsers and can keep super-admin notifications flowing to later lower-privilege sessions on the same browser; and same-tab invite redemption can expose previously rendered super-admin screens through browser history / BFCache restores even though the backend still enforces authorization.

## Threat Categories

### Spoofing

The application uses custom HMAC-signed bearer tokens instead of a managed auth provider. All protected routes must verify signatures, expiry, and role claims server-side, and the secret used to authenticate administrators must not enable token forgery or privilege escalation if a lower-privilege token is exposed.

### Tampering

The API accepts a large number of clinic-scoped writes, file uploads, notification updates, and integration-triggering actions. Every state-changing route must enforce authorization at the server boundary and must not rely on frontend guards or router mount assumptions alone.

### Information Disclosure

The platform stores clinic records, notification content, team member details, documents, and configuration metadata. Public or weakly protected endpoints must not leak cross-clinic data, document URLs, integration status, or secrets, and signed download flows must remain tightly scoped and short-lived.

### Denial of Service

Public-facing authentication, webhook, file upload, and document summarization endpoints can be abused for resource exhaustion. Login throttling, upload size limits, and external-call timeouts must remain effective in production and must not be bypassable through spoofed headers or unbounded inputs.

### Elevation of Privilege

The main privilege boundary is between unauthenticated users, invited team members, and super-admin users. Broken access control in mixed-auth routers, misuse of shared secrets, or flaws in token issuance could let an attacker move from public or low-privilege access to full administrative control.
