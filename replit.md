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
