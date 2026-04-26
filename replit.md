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
- **Authentication:** `SuperAdminGuard` protects sensitive routes, and API endpoints require `requireAuth` middleware, deriving subscriber identity from JWT `sub` claims for push notifications.
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
- **Email Service**: Resend (via `RESEND_API_KEY`)
- **WhatsApp API**: Meta Cloud API (via `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`)
- **Web Push Notifications**: `web-push` npm package
- **UI Libraries**: `@dnd-kit/core` for drag-and-drop
- **PWA Plugin**: `vite-plugin-pwa` (Workbox)
- **External Data Source**: BrasilAPI for CNPJ lookup
- **Logging**: pino for server-side logging