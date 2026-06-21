import { Router, type IRouter } from "express";
import { db, clinicsTable } from "@workspace/db";
import { RegenerateAllTarefasResponse } from "@workspace/api-zod";
import { regenerateTarefasForClinic } from "../lib/tarefa-regenerator.js";

const router: IRouter = Router();

/**
 * Backfill global, acionável SOMENTE pelo super-admin: (re)gera as tarefas
 * sugeridas (somente títulos) de TODAS as ações de TODAS as clínicas, rodando
 * o mesmo `regenerateTarefasForClinic` por clínica e agregando o resultado.
 * As tarefas existentes são SUBSTITUÍDAS; os demais campos das ações são
 * preservados. Idempotente.
 *
 * Auth: a montagem em routes/index.ts já aplica `requireSuperAdmin`, então não
 * há clínica no path e nenhum gestor consegue acionar.
 */
router.post("/admin/actions/regenerate-tarefas", async (req, res): Promise<void> => {
  const clinics = await db.select({ id: clinicsTable.id }).from(clinicsTable);

  const agg = {
    clinicsProcessed: 0,
    actionsProcessed: 0,
    tarefasCreated: 0,
    bySource: { modelo: 0, ia: 0, fallback: 0 },
  };

  for (const clinic of clinics) {
    const result = await regenerateTarefasForClinic(clinic.id);
    agg.clinicsProcessed += 1;
    agg.actionsProcessed += result.actionsProcessed;
    agg.tarefasCreated += result.tarefasCreated;
    agg.bySource.modelo += result.bySource.modelo;
    agg.bySource.ia += result.bySource.ia;
    agg.bySource.fallback += result.bySource.fallback;
  }

  req.log.info(
    {
      clinicsProcessed: agg.clinicsProcessed,
      actionsProcessed: agg.actionsProcessed,
      tarefasCreated: agg.tarefasCreated,
    },
    "regenerate-all-tarefas backfill completed",
  );

  res.json(RegenerateAllTarefasResponse.parse(agg));
});

export default router;
