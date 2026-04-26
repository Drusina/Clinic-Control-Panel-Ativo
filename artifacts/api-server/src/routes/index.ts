import { Router, type IRouter } from "express";
import { requireSuperAdmin } from "../middleware/auth";
import healthRouter from "./health";
import storageRouter from "./storage";
import authRouter from "./auth";
import clinicsRouter from "./clinics";
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

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(authRouter);
// Public LGPD signing endpoints (no auth) — gated only by the signing token.
// MUST be registered BEFORE the first `router.use(requireSuperAdmin, …)` layer
// because passing requireSuperAdmin to `router.use(mw, subRouter)` actually
// installs it as a global layer that runs on every subsequent request.
router.use(lgpdSigningPublicRouter);
router.use(requireSuperAdmin, dashboardRouter);
// Register the clinic-documents (library) routes BEFORE the generic clinics
// router so the more specific paths like POST /clinics/:clinicId/documents
// (multipart upload) take precedence over the legacy attachment endpoints
// in clinics.ts.
router.use(requireSuperAdmin, documentCategoriesRouter);
router.use(requireSuperAdmin, clinicDocumentsRouter);
router.use(requireSuperAdmin, clinicsRouter);
router.use(requireSuperAdmin, statusHistoryRouter);
router.use(requireSuperAdmin, sociosRouter);
router.use(requireSuperAdmin, activityRouter);
router.use(requireSuperAdmin, kickoffsRouter);
router.use(requireSuperAdmin, diagnosticsRouter);
router.use(requireSuperAdmin, perguntasRouter);
router.use(requireSuperAdmin, aiRouter);
router.use(requireSuperAdmin, actionsRouter);
router.use(requireSuperAdmin, risksRouter);
router.use(requireSuperAdmin, teamRouter);
router.use(requireSuperAdmin, faturasRouter);
router.use(requireSuperAdmin, perfilOperacionalRouter);
router.use(requireSuperAdmin, parceirosExternosRouter);
router.use(requireSuperAdmin, sistemasUsoRouter);
router.use(requireSuperAdmin, docsConstitutivoRouter);
router.use(requireSuperAdmin, lgpdTermosRouter);
router.use(requireSuperAdmin, lgpdTemplatesAdminRouter);
router.use(requireSuperAdmin, lgpdSigningProtectedRouter);
// (lgpdSigningPublicRouter is mounted near the top of the chain — see comment above.)
router.use(requireSuperAdmin, delegacoesRouter);
router.use(requireSuperAdmin, processosRouter);
router.use(requireSuperAdmin, evidenciasRouter);
router.use(requireSuperAdmin, documentosRouter);
router.use(requireSuperAdmin, notificationsRouter);
router.use(requireSuperAdmin, jobsRouter);
router.use(notificationPreferencesRouter);
router.use(pushRouter);
router.use(requireSuperAdmin, icsTemplatesRouter);
router.use(requireSuperAdmin, serverConfigRouter);
router.use(requireSuperAdmin, documentAccessLogRouter);
router.use(requireSuperAdmin, cnpjRouter);

export default router;
