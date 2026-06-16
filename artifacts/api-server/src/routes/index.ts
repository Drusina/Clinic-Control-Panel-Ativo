import { Router, type IRouter } from "express";
import { requireSuperAdmin, requireClinicAccess, requireAuth } from "../middleware/auth";
import healthRouter from "./health";
import storageRouter from "./storage";
import authRouter from "./auth";
import meRouter from "./me";
import clinicsRouter, { clinicsAdminRouter } from "./clinics";
import dashboardRouter from "./dashboard";
import activityRouter from "./activity";
import kickoffsRouter from "./kickoffs";
import diagnosticsRouter from "./diagnostics";
import perguntasRouter from "./perguntas";
import aiRouter from "./ai";
import actionsRouter from "./actions";
import risksRouter from "./risks";
import teamRouter from "./team";
import faturasRouter from "./faturas";
import notificationsRouter from "./notifications";
import statusHistoryRouter from "./status-history";
import sociosRouter from "./socios";
import perfilOperacionalRouter from "./perfil-operacional";
import parceirosExternosRouter from "./parceiros-externos";
import sistemasUsoRouter from "./sistemas-uso";
import docsConstitutivoRouter from "./docs-constitutivos";
import lgpdTermosRouter from "./lgpd-termos";
import lgpdTemplatesAdminRouter from "./lgpd-templates";
import {
  lgpdSigningProtectedRouter,
  lgpdSigningPublicRouter,
} from "./lgpd-signing";
// NOTE: Autentique integration is desativada — substituída por assinatura
// eletrônica simples hospedada na própria plataforma (Lei 14.063/2020).
// Mantemos o arquivo `routes/autentique.ts` no repositório para histórico,
// porém SEM registrar suas rotas.
import delegacoesRouter from "./delegacoes";
import processosRouter from "./processos";
import evidenciasRouter from "./evidencias";
import documentosRouter from "./documentos";
import jobsRouter from "./jobs";
import notificationPreferencesRouter from "./notification-preferences";
import pushRouter from "./push";
import icsTemplatesRouter from "./ics-templates";
import serverConfigRouter from "./server-config";
import documentAccessLogRouter from "./document-access-log";
import cnpjRouter from "./cnpj";
import documentCategoriesRouter from "./document-categories";
import clinicDocumentsRouter from "./clinic-documents";
import societaryDocsRouter from "./societary-docs";
import respondentRouter from "./respondent";
import trilhaRouter from "./trilha";
import compromissosRouter from "./compromissos";
import { clinicLogoPublicRouter, clinicLogoScopedRouter } from "./clinic-logo";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(authRouter);
// Per-pilar diagnostic respondent — public POST /api/auth/responder + token-gated
// /api/respondent/* endpoints. Mounted at top-level (no requireAuth wrapper)
// because each handler verifies its own diagnostic_respondent token inline.
router.use(respondentRouter);
// `meRouter` exposes `/api/me/clinics`. Mounted with no extra middleware
// because it gates itself with `requireAuth` per-route (super_admin and
// team_member both consume it).
router.use(meRouter);
// Public LGPD signing endpoints (no auth) — gated only by the signing token.
// MUST be registered BEFORE the first `router.use(requireXxx, …)` layer
// because passing middleware to `router.use(mw, subRouter)` actually
// installs it as a global layer that runs on every subsequent request.
router.use(lgpdSigningPublicRouter);
// Public clinic logo — GET /api/clinics/:id/logo streams the image with no
// auth (the logo is not confidential and must render via a plain <img src>).
// MUST be registered BEFORE the requireClinicAccess layer below.
router.use(clinicLogoPublicRouter);

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT — middleware mounting note
// `router.use(mw, subRouter)` registers `mw` as a global layer that runs on
// EVERY subsequent request, not just on requests that match a route inside
// `subRouter`. As a consequence, the order below matters: routers that need
// looser auth must come BEFORE routers that need tighter auth.
//
// Strategy:
//   1. requireClinicAccess group  → super_admin OR team_member with the
//      clinicId from the URL in their `equipe_interna` access list.
//   2. requireAuth group          → super_admin OR team_member; routes
//      enforce clinic ownership inline (look up record → assertClinicAccess).
//   3. requireSuperAdmin group    → super_admin only (global admin).
// ─────────────────────────────────────────────────────────────────────────────

// (1) Clinic-scoped routers — the URL always carries `:clinicId` (or `:id`
//     for clinicsRouter), so requireClinicAccess can authorise per-route.
//     Register clinic-documents BEFORE clinicsRouter so the more specific
//     POST /clinics/:clinicId/documents (multipart) wins over the legacy
//     attachment endpoints in clinics.ts.
router.use(requireClinicAccess, documentCategoriesRouter);
router.use(requireClinicAccess, clinicDocumentsRouter);
router.use(requireClinicAccess, societaryDocsRouter);
router.use(requireClinicAccess, clinicLogoScopedRouter);
router.use(requireClinicAccess, clinicsRouter);
router.use(requireClinicAccess, statusHistoryRouter);
router.use(requireClinicAccess, sociosRouter);
router.use(requireClinicAccess, activityRouter);
router.use(requireClinicAccess, trilhaRouter);
router.use(requireClinicAccess, kickoffsRouter);
router.use(requireClinicAccess, actionsRouter);
router.use(requireClinicAccess, risksRouter);
router.use(requireClinicAccess, compromissosRouter);
router.use(requireClinicAccess, faturasRouter);
router.use(requireClinicAccess, perfilOperacionalRouter);
router.use(requireClinicAccess, parceirosExternosRouter);
router.use(requireClinicAccess, sistemasUsoRouter);
router.use(requireClinicAccess, docsConstitutivoRouter);
router.use(requireClinicAccess, lgpdTermosRouter);
router.use(requireClinicAccess, lgpdSigningProtectedRouter);
router.use(requireClinicAccess, delegacoesRouter);
router.use(requireClinicAccess, processosRouter);
router.use(requireClinicAccess, evidenciasRouter);
router.use(requireClinicAccess, documentosRouter);

// (2) Mixed routers — some endpoints are URL-scoped, others use
//     ID lookups (member id, diagnostic id). Mounted with requireAuth and
//     enforce access via `assertClinicAccess` inside each handler.
router.use(requireAuth, teamRouter);
router.use(requireAuth, diagnosticsRouter);
router.use(requireAuth, perguntasRouter);
router.use(requireAuth, aiRouter);

// User-scoped (no clinic context) — mounted as plain auth-protected.
router.use(notificationPreferencesRouter);
router.use(pushRouter);

// (3) Super-admin-only — global resources (operator-side).
router.use(requireSuperAdmin, dashboardRouter);
router.use(requireSuperAdmin, clinicsAdminRouter);
router.use(requireSuperAdmin, lgpdTemplatesAdminRouter);
router.use(requireSuperAdmin, notificationsRouter);
router.use(requireSuperAdmin, jobsRouter);
router.use(requireSuperAdmin, icsTemplatesRouter);
router.use(requireSuperAdmin, serverConfigRouter);
router.use(requireSuperAdmin, documentAccessLogRouter);
router.use(requireSuperAdmin, cnpjRouter);

export default router;
