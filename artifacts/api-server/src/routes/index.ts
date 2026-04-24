import { Router, type IRouter } from "express";
import { requireSuperAdmin } from "../middleware/auth";
import healthRouter from "./health";
import authRouter from "./auth";
import clinicsRouter from "./clinics";
import dashboardRouter from "./dashboard";
import activityRouter from "./activity";
import kickoffsRouter from "./kickoffs";
import diagnosticsRouter from "./diagnostics";
import actionsRouter from "./actions";
import risksRouter from "./risks";
import teamRouter from "./team";
import faturasRouter from "./faturas";
import notificationsRouter from "./notifications";
import statusHistoryRouter from "./status-history";
import sociosRouter from "./socios";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(requireSuperAdmin, dashboardRouter);
router.use(requireSuperAdmin, clinicsRouter);
router.use(requireSuperAdmin, statusHistoryRouter);
router.use(requireSuperAdmin, sociosRouter);
router.use(requireSuperAdmin, activityRouter);
router.use(requireSuperAdmin, kickoffsRouter);
router.use(requireSuperAdmin, diagnosticsRouter);
router.use(requireSuperAdmin, actionsRouter);
router.use(requireSuperAdmin, risksRouter);
router.use(requireSuperAdmin, teamRouter);
router.use(requireSuperAdmin, faturasRouter);
router.use(notificationsRouter);

export default router;
