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
2. **Financeiro & Contrato** — Contract values (implantação, MRR, forma de pagamento, reajuste index, Autentique button) + Faturas table
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
