# Overview

CCP IONEX is a pnpm-workspace TypeScript monorepo — a Super Admin CRM for managing clinics. It covers clinic registration, financial/contract management, operational oversight, risk assessment, and action planning. Core capabilities: clinic management with status tracking, user management, document handling, a 150-question diagnostic wizard with AI analysis, delegation tools, a risk matrix, and a Kanban action-plan board. It includes PWA features and email, WhatsApp, and web-push notifications.

# User Preferences

I prefer iterative development with clear communication on significant changes. For API design, I prefer a RESTful approach. I expect the agent to use type-safe practices and adhere to the established monorepo structure. Ensure that new features integrate seamlessly with existing architecture and database schemas. Before making major architectural decisions or introducing new third-party services, please ask for confirmation.

# System Architecture

## Stack
- pnpm workspace monorepo, Node.js 24, TypeScript 5.9.
- Backend (`artifacts/api-server`): Express 5, PostgreSQL + Drizzle ORM, Zod (`zod/v4`) + `drizzle-zod` validation. Contract-first — OpenAPI spec (`lib/api-spec/openapi.yaml`) + Orval codegen (`pnpm --filter @workspace/api-spec run codegen`); esbuild for CJS bundling; pino logging.
- Frontend (`artifacts/ccp`): React + Vite + wouter. Portuguese UI.

## UI/UX
- **Super-admin shell (`components/layout.tsx`):** URL-driven two-mode chrome — **Plataforma** mode (platform nav: Painel, Clínicas, Templates ICS, Templates LGPD, Notificações, Integrações/Configurações) and **Clínica** mode (clinic-scoped nav + a fixed clinic banner with "Trocar de clínica" / "Sair para a plataforma"), entered when the route carries an accessible clinicId. Platform routes (`/`, `/admin/clinicas`, `/admin/ics-templates`, `/admin/lgpd-templates`, `/admin/configuracoes`, `/configuracoes`) always render platform chrome. The team_member `PortalLayout` is a separate component and is unchanged.
- **Painel (platform dashboard, `pages/dashboard.tsx`):** 4 KPI cards + a responsive grid of clinic cards with a combined semáforo (overdue actions / open critical risks / Trilha activity, sourced from the read-only counts on `GET /api/clinics`), name search + status filters (Todas/Atenção/Críticas/Em implantação), and "Entrar na clínica" (sets the active clinic and opens `/admin/clinicas/:id?tab=overview`). Allow-listed in `scripts/check-forbidden-imports.mjs` to use `useListClinics`.
- **Clinics list:** KPI cards + sortable/filterable table. Super-admin only (`SuperAdminGuard`).
- **Clinic forms:** BrasilAPI CNPJ lookup auto-fills data.
- **Clinic detail (`pages/clinics/detail.tsx`):** Tabbed and URL-synced via `?tab=` (Cadastro, Central Comercial, Status, Usuários, Atividade, Visão Geral, Kickoff, Reuniões, Documentos, Diagnóstico, Riscos, Plano de Ação, Agenda, Equipe, Rede Externa, Sistemas e Acessos). The **Reuniões** tab wraps the Kick Off module plus an "em breve" placeholder for future meeting types. The **Diagnóstico** tab embeds the shared `DiagnosticoSection` with an admin base path so its inner `?aba=delegacao` deep links stay under `/admin/clinicas/:id`; leaving the Diagnóstico tab clears the `aba`/`diagnostico` params.
- **Templates LGPD (`pages/lgpd-templates`):** super-admin page (route `/admin/lgpd-templates`, under `AppLayout` + `SuperAdminGuard`) to edit the título/corpo of the LGPD term templates with PDF preview, reusing `useLgpdTemplates`/`useUpdateLgpdTemplate`/`previewLgpdTemplate`.
- **Diagnostic wizard:** Full-screen, autosaving 150-question diagnostic; results shown with a radar chart + AI insights.
- **Operational modules:**
    - **Delegação & Respostas:** Two-level delegation table for 8 pillars with status management. Lives as a tab inside the "Diagnóstico 360°" module (`pages/clinics/tabs/diagnostico-section.tsx`), URL-driven via `?aba=delegacao`. Legacy entry points redirect to `/portal/clinica/:id/diagnostico?aba=delegacao`.
    - **Mapa de Riscos:** 5x5 CSS-grid risk matrix, color-coded, with ranked lists.
    - **Kanban (Plano de Ação):** Drag-and-drop board (5 columns) with priority indicators and filtering. Cards open a rich **Detalhes** view (shared component `components/acao/action-detail.tsx`, used by both the standalone Kanban `pages/acao/index.tsx` and the embedded `pages/clinics/tabs/action-plan-tab.tsx`): Descrição, Responsável, Pilar, editable Data de Início + Prazo, a red **"Risco Vinculado"** card showing `Score: {severidade} (P{prob} × I{impacto})` plus the diagnostic source answers (`perguntasFonte`) that originated the risk, an interactive Checklist with progress, linked Evidências, and timestamped Notas do Coordenador. The risk and its source answers are resolved server-side and scoped to the action's own clinic (cross-clinic guard). Related tables: `acao_checklist_itens`, `acao_evidencias` (unique `(acaoId,evidenciaId)`), `acao_notas`; `acoes.data_inicio`. Endpoints in `routes/actions.ts` (`GET /actions/:id/detail`, checklist/evidencias/notas CRUD) all guarded by `assertClinicAccess`.
    - **Agenda:** Per-clinic calendar of `compromissos` (reunião/tarefa/marco) with month/week/list views and full CRUD via the shared `components/agenda/agenda-module.tsx`. Surfaced in the super-admin clinic detail, the portal `painel-clinica`, and a portal hub card. A compromisso can optionally link to a Trilha `etapaKey` and/or an action `acaoId` (Agenda NEVER mutates Trilha progresso/etapa). The action card has an "Agendar" affordance and a next-appointment indicator. Reached only via the clinic-scoped path `/portal/clinica/:clinicId/agenda`.
    - **Trilha de Implementação:** Fixed 15-stage clinic-journey stepper (`components/trilha/trilha-stepper.tsx`). Progression is automatic — `reconcileTrilha(clinicId)` (`api-server/src/lib/trilha.ts`) concludes the 11 data-detectable (`manual:false`) stages with no confirm click (actor `"Sistema (automático)"`) and reopens any whose live signal lapsed. It is the single source of truth: runs on every GET (via `loadTrilha`) and at boot (`backfillTrilha`), idempotent. The 4 manual marcos (avaliacao, montagem_painel, treinamento, acompanhamento) still need an explicit consultant PATCH, and human overrides `bloqueado`/`nao_aplicavel` win over the signal (only a PATCH back to `pendente` clears them). The **LGPD** stage completes only when all 6 termos are formalized (`lgpd_termos` rows with `slug ∈ TEMPLATE_SLUGS` AND `status ∈ ('assinado','anexado')`). `clinics.etapa`/`progresso` are derived from the rows, recomputed in the same tx.
- **PWA:** `vite-plugin-pwa` (manifest, icons, Workbox service worker for caching).
- **Notification preferences:** `NotificationPreferencesModal` for email/WhatsApp toggles.

## Backend implementation
- **Schema highlights:** `clinic_status_history`, `socios`, `perguntas`, `respostas`, `delegacoes`, `push_subscriptions`, plus the action/agenda/trilha tables above. Risks carry a `perguntas_fonte` JSONB snapshot (textual pergunta+resposta, no FK).
- **API:** RESTful endpoints for clinics, status updates, QSA partners, user invites, document uploads, diagnostic questions/answers, delegation, risks, and push notifications.
- **Object storage:** Replit App Storage (GCS-backed) for documents. Private objects are served as attachment with `nosniff` via short-lived, path-bound signed URLs; inline preview is opt-in and gated to a PDF/raster allowlist (no HTML/SVG) to avoid stored XSS.
- **AI:** `@anthropic-ai/sdk` (`claude-opus-4-5`) generates structured JSON insights from diagnostic scores.
- **Score calculation:** Weighted-average system for pillar and global diagnostic scores by question type.
- **Notifications:**
    - **Email:** branded dark-theme HTML templates via Resend.
    - **WhatsApp:** pre-approved Meta Cloud API template messages, with graceful fallback to email.
    - **Web push:** `web-push` package, VAPID keys in the DB, a unified service worker. Push identity is derived from the JWT `sub` claim; `resolveActiveTeamMember()` resolves the `equipe_interna` row by email. Recipients are resolved by email **and** clinicId so a duplicate email across clinics never receives another clinic's notification.
    - **Scheduled jobs:** a daily document-expiry digest, and a `*/15`-min `compromisso-reminder` job (`lib/reminder-check.ts`) that atomically claims due rows (`UPDATE ... SET lembrete_enviado_em=now() WHERE due AND null RETURNING *`, preventing duplicate sends across replicas) then sends an email + web push + (when configured and opted-in) WhatsApp reminder, each best-effort. All deep links are clinic-scoped (`/portal/clinica/:clinicId/agenda`).

## Authentication & multi-clinic access
Two roles:
- **super_admin** — global access; operates the product; logs in at `/admin/login` with `SUPER_ADMIN_SECRET` (this flow is unchanged).
- **team_member** — manager of one or more clinics, identified by email in `equipe_interna.tem_acesso_plataforma=true`; logs in at `/entrar` (email + password).

- **Passwords** live per identity (email) in `team_credentials` (bcrypt cost 12), NOT per `equipe_interna` row: `email_normalized` (unique, lowercase), `senha_hash`, `senha_provisoria`, reset token + expiry, `failed_attempts`/`locked_until` (8 consecutive fails → 15-min lockout). When a manager first gets platform access and the email has no credential, the backend generates a 12-char provisional password (`generateProvisionalPassword()`), stores its hash, and emails it; if the email already has a credential (access granted to another clinic), it does NOT rotate — it only emails a heads-up. The only explicit rotation is the "Reenviar acesso" button. `invite-user` and `resend-invite` return **502** if the email fails (the credential is persisted only after Resend confirms, avoiding lockout). First login forces `/trocar-senha` (global `ProvisionalPasswordGate` based on `/auth/me.senhaProvisoria`). "Esqueci minha senha" sends a 1h tokenized reset link. Auth endpoints in `routes/auth.ts` share the super-admin login throttle (10 req/15min per IP).
- **Token:** team_member JWT is v:2 `{role:'team_member', sub:email, email, nome, v:2}` (no fixed clinicId). The bearer token (`ccp_admin_token`) lives in **sessionStorage** — a same-tab refresh keeps the session, but opening the site fresh (new tab/window, reopened PWA) always lands on login. Unauthenticated guards and team_member logout redirect to `/entrar` (which links to super-admin login). `hasPlatformAccess(email)` is re-checked on every successful login, so revoking `tem_acesso_plataforma` blocks future logins.
- **Middlewares** (`middleware/auth.ts`): `requireSuperAdmin` (global routes), `requireClinicAccess` (`/clinics/:clinicId/...`, case-insensitive lookup in `equipe_interna` by email + clinic_id), and `requireAuth` + inline `assertClinicAccess(req, res, clinicId)` for `:id`-style routes that must load the record before checking the clinic. Express gotcha: `requireClinicAccess` calls `next()` when the URL has no `/clinics/<uuid>` so it doesn't block super-admin routes mounted after it.
- **Clinic resolution:** `GET /api/me/clinics` returns accessible clinic cards (super_admin → all; team_member → filtered). Frontend uses `useMyClinics`, `ClinicAccessGuard` (redirects to `/me/clinicas`), a `/me/clinicas` chooser, and a header clinic selector when a manager has 2+ clinics (active clinic persisted in sessionStorage `ccp_active_clinic_id`; single clinic auto-resolves). Portal "select clinic" screens use the shared `useClinicsForCurrentUser` hook (super_admin → `GET /api/clinics`; team_member → `GET /api/me/clinics`) — **never** the super-admin-only Orval `useListClinics`, enforced by `scripts/check-forbidden-imports.mjs` (allow-listed only for `pages/clinics/index.tsx`, which is under `SuperAdminGuard`).
- **Respondente de Diagnóstico:** a 4th option in "Convidar Usuário" that forces `tem_acesso_plataforma=false` on all write routes (even if the frontend sends `true`); it never generates a platform password or `team_credentials` row. The real access is the scoped `diagnostic_respondent` token (delegation + pillar, in `routes/respondent.ts`). Signup and "Reenviar link" reuse `dispatchRespondentInvitesForEmail(clinicId, email, ...)` which scans all open delegations for the email, regenerates each `invite_code`, and sends one email per delegation. Status in `equipe_interna.invite_status` (`sent` / `no_delegations` / `pending`). Demoting an existing user to respondent revokes current access but preserves the global `team_credentials` (access in other clinics).
- **Token signing key:** HS256 key auto-bootstrapped before `app.listen()` by `initTokenSigningSecret()` (`lib/token-secret.ts`) — prefers `TOKEN_SIGNING_SECRET` only when set AND different from `SUPER_ADMIN_SECRET`; otherwise reads `server_config.token_signing_secret`, generating + persisting a random 48-byte value (`INSERT ... ON CONFLICT DO NOTHING`, replica-safe) if absent. Init fails the process on error so no request reaches the server with broken auth. Rotate via `DELETE FROM server_config WHERE key='token_signing_secret'` + restart.

# External Dependencies

- **Monorepo tool:** pnpm workspaces
- **Runtime / language:** Node.js 24, TypeScript 5.9
- **API framework:** Express 5
- **Database / ORM:** PostgreSQL, Drizzle ORM
- **Validation:** Zod (`zod/v4`), `drizzle-zod`
- **API codegen:** Orval
- **Build tool:** esbuild
- **AI service:** Anthropic AI (`@anthropic-ai/sdk`, `claude-opus-4-5`)
- **Email service:** Resend (config in `/admin/configuracoes`, DB-backed via `server_config` with env fallbacks — see below)
- **WhatsApp API:** Meta Cloud API (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`)
- **Web push:** `web-push` npm package
- **UI libraries:** `@dnd-kit/core` (drag-and-drop)
- **PWA plugin:** `vite-plugin-pwa` (Workbox)
- **External data source:** BrasilAPI (CNPJ lookup)
- **Logging:** pino

# Email configuration (Resend + clinionex.com.br)

Transactional emails (invites, delegations, expiry alerts, signature confirmations, push activation) go through Resend. Configuration is managed in **`/admin/configuracoes`** → card **"E-mail Oficial — Resend"** and stored in `server_config` (DB), with env-var fallback.

## Configurable keys (`server_config`)

| Key                    | Sensitive | Env fallback             | Example                                       |
|------------------------|-----------|--------------------------|-----------------------------------------------|
| `resend_api_key`       | ✓         | `RESEND_API_KEY` → Replit integration | `re_xxx...`                      |
| `resend_from_address`  |           | `RESEND_FROM_ADDRESS`    | `IONEX360 <noreply@clinionex.com.br>`         |
| `reply_to_address`     |           | `REPLY_TO_ADDRESS`       | `gestor@blusolution.com.br`                   |
| `app_url`              |           | `APP_URL`                | `https://app.clinionex.com.br`                |

`sendEmail()` / `sendEmailDetailed()` (`lib/email.ts`) read these via `getConfig()` at runtime; `reply_to_address` maps to the Resend `reply_to` field. `resolveAppUrl(req?)` returns, in order: DB value → env `APP_URL` → `req.protocol://req.host` → default `https://app.clinionex.com.br` (this fallback order also avoids Host-header poisoning in production).

**`resend_api_key` precedence:** (1) DB value (manual operator override), (2) env `RESEND_API_KEY`, (3) Replit Resend integration (default today, auto-rotated; fetched via `lib/replit-connectors.ts` with a 60s cache). When the key comes from the integration, the config card shows a green "via integração Replit" badge and hides "Alterar". `resend_from_address` is never pulled from the integration (the Replit account email is rarely a verified domain) — the operator sets it, or it falls back to the `onboarding@resend.dev` sandbox.

## Domain verification (Hostinger DNS)

1. https://resend.com/domains → "Add Domain" → `clinionex.com.br` (Brazil/SA region).
2. Add the records Resend shows in Hostinger DNS: **SPF** TXT at `@` (`v=spf1 include:_spf.resend.com ~all`), **DKIM** CNAME at `resend._domainkey` (exact value from Resend), optional **DMARC** TXT at `_dmarc`, optional **MX** for bounces.
3. Wait for "Verified", then save `noreply@clinionex.com.br` as the From address.

## Status & test endpoints (super-admin, `routes/server-config.ts`)

- `GET /api/admin/resend/domain-status` + `POST /api/admin/resend/verify-domain` — power the `ResendDomainStatusCard` badge ("Domínio verificado" / "aguardando DNS"). Domain id resolves via env `RESEND_DOMAIN_ID` → host match on `resend_from_address` → first account domain. 30s in-memory cache.
- `POST /api/admin/test-email` (alias `POST /api/admin/config/integrations/test-email`) — body `{ "to": "..." }`, returns `{ ok, error?, status?, from, replyTo, to }`. The test card disables sending until `resend_api_key` is configured.
