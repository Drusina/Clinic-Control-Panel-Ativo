import { Router, type IRouter } from "express";
import healthRouter from "./health";
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

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(clinicsRouter);
router.use(activityRouter);
router.use(kickoffsRouter);
router.use(diagnosticsRouter);
router.use(actionsRouter);
router.use(risksRouter);
router.use(teamRouter);
router.use(faturasRouter);
router.use(notificationsRouter);

export default router;
