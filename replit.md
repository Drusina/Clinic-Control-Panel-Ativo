# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## CCP IONEX — Super Admin CRM (M2)

### Clinics List (`/clinics`)
- 4 KPI cards: Total de Clínicas, Ativas, Em Trial, MRR Total
- Table with search/filter by status and plano
- Columns: Clínica, CNPJ, Responsável, Plano, Status, Etapa, MRR, Ações

### New Clinic Form (`/clinics/new`)
- **BrasilAPI CNPJ Lookup**: Enter CNPJ and click "Buscar na Receita" to auto-fill fields from Receita Federal
  - Validates CNPJ check digits before fetching
  - Fills: razao_social, nome_fantasia, address (logradouro, cidade, uf, cep)
  - Displays QSA (Quadro de Sócios e Administradores) badges

### Clinic Detail (`/clinics/:id`) — 11 Tabs
1. **Cadastro** — Editable form for all clinic fields + QSA (socios) CRUD
2. **Financeiro & Contrato** — Contract values (implantação, MRR, forma de pagamento, reajuste index, Autentique button) + PDF upload for Proposta/Contrato + Faturas table
3. **Status** — Lifecycle state machine (prospect → proposta → contrato → trial → ativa → suspensa/desativada), status history timeline, confirmation dialogs for suspend/deactivate
4. **Usuários** — Platform user management with invite-by-email dialog
5. **Atividade** — Activity timeline
6. **Visão Geral**, **Kickoff**, **Diagnóstico**, **Plano de Ação**, **Riscos**, **Equipe** — Operational modules

### Route Guard
- `SuperAdminGuard` component wraps all `/clinics/*` routes
- Will redirect non-super_admin users; currently configured as super_admin

### New DB Tables
- `clinic_status_history` — Tracks all status changes with motivo and author
- `socios` — Clinic QSA partners linked to clinics

### New API Endpoints
- `GET /api/clinics/:id/status-history` — Status change history
- `POST /api/clinics/:id/status` — Update status (also writes to history + activity)
- `GET /api/clinics/:clinicId/socios` — List QSA partners
- `POST /api/clinics/:clinicId/socios` — Add QSA partner
- `PUT /api/clinics/:clinicId/socios/:socioId` — Update QSA partner
- `DELETE /api/clinics/:clinicId/socios/:socioId` — Delete QSA partner
- `POST /api/clinics/:id/invite-user` — Invite user to clinic (mock, logs activity)
- `POST /api/clinics/:id/documents?type=proposta|contrato` — Upload PDF to App Storage; saves serving URL to clinic record
- `GET /api/storage/objects/*` — Serve files from Replit App Storage (GCS-backed, no auth required)
- `GET /api/storage/public-objects/*` — Serve public objects from PUBLIC_OBJECT_SEARCH_PATHS
- `POST /api/storage/uploads/request-url` — Request a presigned URL for direct-to-GCS upload

### Object Storage (App Storage)
- Provisioned bucket: see `DEFAULT_OBJECT_STORAGE_BUCKET_ID` secret
- Files stored under `PRIVATE_OBJECT_DIR/clinic-docs/{clinicId}/{type}-{timestamp}.pdf`
- Serving URL stored in `clinics.proposta_url` / `clinics.contrato_url` as `/api/storage/objects/clinic-docs/...`
- Server files: `artifacts/api-server/src/lib/objectStorage.ts` (GCS client), `artifacts/api-server/src/routes/storage.ts` (routes)

## M4 — Diagnóstico 360° + AI Insights

### Overview
Full 150-question diagnostic wizard with 8 pillars, autosave, score calculation, radar chart results, and Claude AI insights.

### New DB Tables
- `perguntas` — 150 questions seeded from CSV, with `pilar_slug`, `pilar_nome`, `tipo` (sim_nao/escala_1_5/texto_livre/numerico), `peso`, `ordem`
- `respostas` — Answers keyed by `(diagnostico_id, pergunta_id)` with upsert

### New Routes
- `/diagnostico/select` — Clinic + diagnostic session selector
- `/diagnostico/:id` — Wizard with full-screen question, pillar navigation, autosave
- `/diagnostico/:id/resultado` — Radar chart, score table, AI insights

### New API Endpoints
- `GET /api/perguntas` — All 150 questions ordered by pillar + order
- `GET /api/diagnostics/:id/respostas` — All answers for a diagnostic
- `PUT /api/diagnostics/:id/respostas/:perguntaId` — Upsert answer (autosave)
- `POST /api/diagnostics/:id/calculate-scores` — Compute weighted pillar scores + global score
- `POST /api/ai/analyze-diagnostico` — Claude claude-opus-4-5 generates JSON insights `{pontos_fortes, pontos_criticos, acoes_sugeridas}`

### Score Calculation
- `sim_nao`: sim=5, nao=1
- `escala_1_5`: direct value
- `numerico`: normalized to 1-5 range (percentage fields)
- `texto_livre`: filled (>10 chars) = 4, empty = 2
- Pillar score = weighted average (answer_value × peso) / sum(peso)
- Global score = mean of 8 pillar scores

### AI Integration
- Uses `@anthropic-ai/sdk` with `claude-opus-4-5`
- Requires `ANTHROPIC_API_KEY` secret
- Prompt includes pillar scores + critical responses
- Returns structured JSON stored in `diagnosticos.insights_ia`
- Each suggested action has a "+ Criar tarefa no Plano de Ação" button

### 8 Pillars (slugs)
estrategia, financeiro, contabil, marketing, operacoes, pessoas, tecnologia, compliance

## M5 — Delegação, Mapa de Riscos & Kanban

### New Pages (Standalone Modules)
- `/delegacao/select` → clinic selector, `/delegacao/:clinicId` → two-level delegation table for 8 pillars
- `/riscos/select` → clinic selector, `/riscos/:clinicId` → 5×5 risk matrix + ranked list
- `/acao/select` → clinic selector, `/acao/:clinicId` → drag-and-drop Kanban board (5 columns)

### Navigation
- Added "OPERACIONAL" collapsible section in sidebar with: Delegação, Mapa de Riscos, Plano de Ação

### Delegação Module
- Table of 8 ICS pillars with expandable rows for N2 sub-delegations
- N1 delegation: select team member (or type name), set deadline, saves to `delegacoes` table
- N2 sub-delegation: set question range (questaoInicio, questaoFim) + responsible
- Status management: nao_delegado, pendente, andamento, concluido, atrasado
- Email notification via Resend if RESEND_API_KEY is set

### Mapa de Riscos (Risk Matrix)
- 5×5 CSS grid colored by severity: green (≤6), yellow (7–14), red (≥15)
- Numbered badges in cells, hover tooltip shows risk name/responsible
- Ranked list sidebar sorted by severidade (prob × impacto) descending
- Click badge highlights corresponding ranked list item and vice versa
- "+ Novo Risco" modal with Probabilidade/Impacto sliders and live severity preview
- Status management: identificado, em_tratamento, mitigado, aceito

### Kanban Board (Plano de Ação)
- 5 columns: Backlog, A Fazer, Em Andamento, Revisão, Concluído
- Drag-and-drop with @dnd-kit/core; dropping a card updates `acoes.coluna` in DB
- Priority color bar on cards (red=alta, yellow=media, green=baixa)
- Filter bar: by responsável, pilar, prioridade
- Card detail dialog: edit all fields including description

### New DB Table
- `delegacoes` — clinic_id, pilar_slug, pilar_nome, nivel (1 or 2), responsavel_nome, responsavel_email, prazo, status, questao_inicio, questao_fim, parent_id, observacoes

### New API Endpoints
- `GET /api/clinics/:clinicId/delegacoes` — List delegations
- `POST /api/clinics/:clinicId/delegacoes` — Create delegation (N1 or N2)
- `PATCH /api/delegacoes/:id` — Update delegation (status, responsible, etc.)
- `DELETE /api/delegacoes/:id` — Remove delegation

## M7 — PWA, Email & WhatsApp Notifications

### PWA
- `vite-plugin-pwa` installed in CCP; VitePWA plugin configured in `vite.config.ts`
- Manifest: name "IONEX360", short_name "IONEX", theme/background `#0a0b0f`, display `standalone`
- Icons: `public/icon-192.svg` and `public/icon-512.svg` in IONEX blue/gold style
- Service worker (Workbox) caches app shell and uses NetworkFirst for `/api/*` routes (production only)

### Email Templates
- `artifacts/api-server/src/lib/email.ts` — branded dark-theme HTML templates + `sendEmail()` helper
- Three templates: **invite** (magic link + role), **delegation** (pilar name, deadline, deep link), **document expiry digest** (table of expiring docs)
- Delegation notifications updated to use branded templates; invite sends branded email via Resend when `RESEND_API_KEY` is set

### WhatsApp (Meta Cloud API)
- `artifacts/api-server/src/lib/whatsapp.ts` — helper for `delegacao_pilar` and `aprovacao_termo` pre-approved template messages
- Graceful fallback to email if `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` env vars are not set
- Integrated at delegation creation (`POST /api/clinics/:clinicId/delegacoes`)

### Document Expiry Cron
- `POST /api/jobs/expiry-check` — queries documents with `validade` within 30 days, sends per-clinic digest emails
- Runs automatically via `setInterval` daily when server starts (calls same logic as the route)
- Requires `RESEND_API_KEY` to send; logs results via pino

### Notification Preferences
- `notification_preferences` JSONB column added to `equipe_interna` (teamTable) via DB push
- API: `GET/PATCH /api/notification-preferences/:memberId` — read/update email+whatsapp toggles
- UI: `NotificationPreferencesModal` component in `artifacts/ccp/src/components/notification-preferences-modal.tsx`
- Settings button in sidebar opens modal; preferences stored in localStorage for super admin
- Env vars required: `RESEND_API_KEY`, `APP_URL`, `WHATSAPP_TOKEN` (optional), `WHATSAPP_PHONE_ID` (optional)
