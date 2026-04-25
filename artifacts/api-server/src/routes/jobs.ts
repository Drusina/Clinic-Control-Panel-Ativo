import { Router, type IRouter } from "express";
import { runExpiryCheck } from "../lib/expiry-check.js";

const router: IRouter = Router();

router.post("/jobs/expiry-check", async (_req, res): Promise<void> => {
  try {
    const result = await runExpiryCheck();
    res.json(result);
  } catch (err) {
    console.error("expiry-check error:", err);
    res.status(500).json({ error: "Erro ao verificar documentos" });
  }
});

export default router;
