# Overview

This project is a pnpm workspace monorepo using TypeScript, designed to function as a Super Admin CRM called "CCP IONEX". Its primary purpose is to manage clinics, encompassing functionalities from initial registration and detailed financial/contract management to operational oversight, risk assessment, and action planning. The system aims to streamline clinic administration, enhance decision-making through AI-driven insights, and improve communication via integrated notification systems. Key capabilities include a comprehensive clinic management system with status tracking, user management, document handling, a 150-question diagnostic wizard with AI analysis, delegation tools, a risk matrix, and a Kanban board for action plans. The project also integrates PWA features, email, WhatsApp, and web push notifications to ensure robust communication and user engagement.

# User Preferences

I prefer iterative development with clear communication on significant changes. For API design, I prefer a RESTful approach. I expect the agent to use type-safe practices and adhere to the established monorepo structure. Ensure that new features integrate seamlessly with existing architecture and database schemas. Before making major architectural decisions or introducing new third-party services, please ask for confirmation.

# System Architecture

The project is structured as a pnpm workspace monorepo, utilizing Node.js 24 and TypeScript 5.9. The backend is built with Express 5, using PostgreSQL and Drizzle ORM for database interactions, with Zod for validation. API codegen is handled by Orval from an OpenAPI specification, and `esbuild` is used for CJS bundling.

**UI/UX Decisions:**
- **Clinics List:** Features KPI cards and a sortable table with filters.
- **Clinic Forms:** Implements BrasilAPI CNPJ lookup for auto-filling data.
- **Clinic Detail:** Organized into 11 tabs covering various aspects like 'Cadastro', 'Financeiro & Contrato', 'Status', 'Usuários', and operational modules.
- **Diagnostic Wizard:** A full-screen, autosaving interface for a 150-question diagnostic, presenting results with a radar chart and AI insights.
- **Operational Modules:**
    - **Delegação:** A two-level delegation table for 8 pillars with status management.
    - **Mapa de Riscos:** A 5x5 CSS grid risk matrix with color-coding and ranked lists.
    - **Kanban Board:** A drag-and-drop Kanban board with 5 columns for action plans, featuring priority indicators and filtering.
- **PWA:** Configured with `vite-plugin-pwa` for manifest, icons, and a Workbox service worker for caching.
- **Notification Preferences:** UI component `NotificationPreferencesModal` for managing email and WhatsApp toggles.

**Technical Implementations:**
- **Database Schema:** New tables include `clinic_status_history`, `socios`, `perguntas`, `respostas`, `delegacoes`, and `push_subscriptions`.
- **API Endpoints:** Comprehensive RESTful API endpoints for managing clinics, status updates, QSA partners, user invites, document uploads, diagnostic questions/answers, delegation, risks, and push notifications.
- **Object Storage:** Utilizes Replit App Storage (GCS-backed) for document storage, with specific routes for serving and managing files.
- **AI Integration:** Uses `@anthropic-ai/sdk` with `claude-opus-4-5` for generating structured JSON insights based on diagnostic scores.
- **Score Calculation:** Implements a weighted average system for diagnostic pillar and global scores based on question types.
- **Notifications:**
    - **Email:** Branded dark-theme HTML templates for various notifications (invite, delegation, document expiry) using Resend.
    - **WhatsApp:** Helper for pre-approved template messages via Meta Cloud API, with graceful fallback to email.
    - **Web Push:** Uses `web-push` npm package, VAPID keys stored in the DB, and a unified service worker for browser push notifications.
- **Authentication & Multi-clinic Access (Task #136):** Two roles: `super_admin` (acesso global, opera o produto) e `team_member` (gestor de uma ou mais clínicas, identificado por e-mail em `equipe_interna.tem_acesso_plataforma=true`). O JWT do convite é v:2 com `{role:'team_member', sub:email, email, nome, v:2}` — sem `clinicId` fixo. Backend tem três middlewares em `middleware/auth.ts`:
    - `requireSuperAdmin` (rotas globais: dashboard, criação/listagem/desativação de clínicas, ICS templates, jobs, server-config),
    - `requireClinicAccess` (rotas escopadas com `/clinics/:clinicId/...`; faz lookup case-insensitive em `equipe_interna` por email + clinic_id),
    - `requireAuth` + `assertClinicAccess(req, res, clinicId)` inline para rotas com `:id`/`:diagnosticId`/`:teamId` que precisam carregar o registro do banco antes de checar a clínica (actions/risks/faturas/delegacoes/processos/evidencias/documentos PATCH/DELETE, team/diagnostics/perguntas/ai).
    - Endpoint `GET /api/me/clinics` devolve cards das clínicas acessíveis (super_admin → todas; team_member → filtradas).
    - Frontend: `useMyClinics`, `ClinicAccessGuard` (redireciona para `/me/clinicas` se não autorizado), página `/me/clinicas` (0/1/2+ clínicas), seletor de clínica no header quando o gestor tem 2+ clínicas (persistido em `localStorage` chave `ccp_active_clinic_id`).
    - **Telas de "selecionar clínica" do portal** (Delegação, Riscos, Plano de Ação, Processos, Evidências, Documentos, Kickoff, Relatórios, Diagnóstico) usam o hook compartilhado `useClinicsForCurrentUser` em `artifacts/ccp/src/hooks/use-clinics-for-current-user.ts` — super_admin → `GET /api/clinics`, team_member → `GET /api/me/clinics`. **NÃO usar o `useListClinics` gerado pelo Orval em telas acessíveis ao gestor** (esse endpoint é super-admin-only e bypass-armadilha). `useListClinics` continua válido apenas para `pages/clinics/index.tsx` (sob `SuperAdminGuard`). **Guard rail automático (task #195):** `artifacts/ccp/scripts/check-forbidden-imports.mjs` roda como primeira etapa do `pnpm --filter @workspace/ccp run typecheck` e quebra o build se `useListClinics` for importado/chamado fora do allow-list (`src/pages/clinics/index.tsx`). Para adicionar nova exceção legítima, edite o array `allow` desse script e envolva a tela com `SuperAdminGuard`.
    - Gotcha importante (express): `router.use(mw, subRouter)` instala `mw` como camada global — `requireClinicAccess` faz `next()` quando o URL não contém `/clinics/<uuid>` para não bloquear rotas super-admin que vêm depois; quem decide é a camada seguinte.
  Push: `SuperAdminGuard` protects sensitive routes, and API endpoints require `requireAuth` middleware, deriving subscriber identity from JWT `sub` claims for push notifications. Push em v:2 resolve o `equipe_interna.id` por email no helper `resolveActiveTeamMember()` em `routes/push.ts`. The HS256 signing key is auto-bootstrapped on first boot: `initTokenSigningSecret()` (em `artifacts/api-server/src/lib/token-secret.ts`) prefere `TOKEN_SIGNING_SECRET` apenas quando definido **e diferente** de `SUPER_ADMIN_SECRET`; caso contrário lê `server_config.token_signing_secret`; se ausente, gera 48 bytes aleatórios (base64), persiste com `INSERT ... ON CONFLICT DO NOTHING` (seguro p/ múltiplos replicas), relê o valor canônico e cacheia em memória. A inicialização ocorre **antes** de `app.listen()` e **falha o processo** se der erro, garantindo que nenhuma requisição chegue ao servidor com auth quebrado. Para rotacionar: `DELETE FROM server_config WHERE key='token_signing_secret'` e reinicie.
- **Scheduled Jobs:** A daily cron job implemented via `setInterval` checks for expiring documents and sends digest emails/push notifications.

# External Dependencies

- **Monorepo tool**: pnpm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval
- **Build tool**: esbuild
- **AI Service**: Anthropic AI (`@anthropic-ai/sdk`) for Claude (claude-opus-4-5)
- **Email Service**: Resend (chave + remetente + reply-to gerenciados em `/admin/configuracoes` — DB-backed via `server_config`, com fallback para env vars `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `REPLY_TO_ADDRESS`, `APP_URL`)
- **WhatsApp API**: Meta Cloud API (via `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`)
- **Web Push Notifications**: `web-push` npm package
- **UI Libraries**: `@dnd-kit/core` for drag-and-drop
- **PWA Plugin**: `vite-plugin-pwa` (Workbox)
- **External Data Source**: BrasilAPI for CNPJ lookup
- **Logging**: pino for server-side logging

# Configuração de E-mail (Resend + clinionex.com.br)

O sistema envia e-mails transacionais via Resend (convites, delegações, alertas de expiração, confirmação de assinaturas Autentique, ativação de push). Toda a configuração é gerenciada em **`/admin/configuracoes`** → card **"E-mail Oficial — Resend"** e gravada em `server_config` (DB), com fallback para variáveis de ambiente.

## Chaves configuráveis (table `server_config`)

| Chave                  | Sensível | Fallback env             | Exemplo                                       |
|------------------------|----------|--------------------------|-----------------------------------------------|
| `resend_api_key`       | ✓        | `RESEND_API_KEY` → integração Replit | `re_xxx...`                         |
| `resend_from_address`  |          | `RESEND_FROM_ADDRESS`    | `IONEX360 <noreply@clinionex.com.br>`         |
| `reply_to_address`     |          | `REPLY_TO_ADDRESS`       | `gestor@blusolution.com.br`                   |
| `app_url`              |          | `APP_URL`                | `https://app.clinionex.com.br`                |

`sendEmail()` / `sendEmailDetailed()` (em `artifacts/api-server/src/lib/email.ts`) leem todas as chaves via `getConfig()` em runtime; o `reply_to_address` é mapeado para o campo `reply_to` do payload Resend. `resolveAppUrl(req?)` retorna, em ordem: (1) valor configurado em DB, (2) env `APP_URL`, (3) `req.protocol://req.host` quando há request, (4) default `https://app.clinionex.com.br`.

### Resolução da `resend_api_key` (precedência)

1. Valor salvo no banco (`server_config.resend_api_key`) — operador sobrescreve manualmente
2. Variável de ambiente `RESEND_API_KEY` — útil para overrides em deploy
3. Integração Replit Resend — fonte padrão hoje (gerencia rotação automática); fetched via `artifacts/api-server/src/lib/replit-connectors.ts` com cache de 60s

Quando a chave vem da integração, o card no painel `/admin/configuracoes` mostra o selo verde "via integração Replit" e o botão "Alterar" fica oculto — para sobrescrever, é preciso primeiro remover/desautorizar a integração no painel do Replit ou definir `RESEND_API_KEY` no env. **Importante**: o `resend_from_address` NÃO é puxado da integração (o e-mail da conta Replit raramente é um endereço de domínio verificado no Resend); ele continua sendo definido pelo operador no painel ou cai no sandbox `onboarding@resend.dev` quando vazio.

## Verificação do domínio na Hostinger (DNS)

1. Acesse https://resend.com/domains → "Add Domain" → `clinionex.com.br` (região Brasil/SA).
2. No painel DNS da Hostinger, adicione os registros mostrados pelo Resend:
   - **SPF** — TXT em `@`: `v=spf1 include:_spf.resend.com ~all`
   - **DKIM** — CNAME em `resend._domainkey`: valor exato fornecido pelo Resend
   - **DMARC** (opcional, recomendado) — TXT em `_dmarc`: `v=DMARC1; p=none; rua=mailto:gestor@blusolution.com.br`
   - **MX** (opcional, somente se for receber bounces): conforme instruções do Resend
3. Aguarde a verificação (5min–algumas horas). Quando aparecer "Verified" no Resend, salve `noreply@clinionex.com.br` em **Endereço remetente (From)** no painel.

## Endpoint de teste

`POST /api/admin/test-email` (super-admin) — também acessível como `POST /api/admin/config/integrations/test-email` (alias usado pelo card de teste no painel).

- **Body**: `{ "to": "destino@exemplo.com" }`
- **Response**: `{ ok, error?, status?, from, replyTo, to }` (status = HTTP do Resend quando aplicável)
- A UI (card "Enviar e-mail de teste") mostra um badge de status "Resend conectado" / "Resend não configurado" no topo do card e desabilita o botão de envio enquanto a `resend_api_key` não estiver salva.