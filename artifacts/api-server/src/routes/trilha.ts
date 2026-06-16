import { Router, type IRouter, type Request } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  clinicsTable,
  trilhaEtapasTable,
  clinicActivityTable,
  type TrilhaSugestaoSnapshot,
} from "@workspace/db";
import { getTrilhaEtapa } from "@workspace/trilha";
import {
  UpdateTrilhaEtapaBody,
  GetTrilhaResponse,
  UpdateTrilhaEtapaResponse,
} from "@workspace/api-zod";
import type { AuthenticatedRequest } from "../middleware/auth";
import {
  loadTrilha,
  materializeTrilha,
  recomputeClinicProgress,
  computeStageSuggestion,
} from "../lib/trilha.js";

const router: IRouter = Router();

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluido: "Concluída",
  bloqueado: "Bloqueada",
  nao_aplicavel: "Não se aplica",
};

function firstParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] : (v ?? "");
}

function actorName(req: Request): string {
  const user = (req as AuthenticatedRequest).user;
  return (
    user?.nome ??
    (user?.role === "super_admin" ? "Super Admin" : user?.email) ??
    "Sistema"
  );
}

router.get("/clinics/:clinicId/trilha", async (req, res): Promise<void> => {
  const clinicId = firstParam(req.params.clinicId);
  const trilha = await loadTrilha(clinicId);
  if (!trilha) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }
  res.json(GetTrilhaResponse.parse(trilha));
});

router.patch(
  "/clinics/:clinicId/trilha/:etapaKey",
  async (req, res): Promise<void> => {
    const clinicId = firstParam(req.params.clinicId);
    const etapaKey = firstParam(req.params.etapaKey);

    const def = getTrilhaEtapa(etapaKey);
    if (!def) {
      res.status(400).json({ error: "Etapa de trilha desconhecida" });
      return;
    }

    const parsed = UpdateTrilhaEtapaBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const d = parsed.data;

    const [clinic] = await db
      .select()
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId))
      .limit(1);
    if (!clinic) {
      res.status(404).json({ error: "Clinic not found" });
      return;
    }

    // Ensure the row exists before we update it.
    await materializeTrilha(clinicId);

    const actor = actorName(req);

    // Snapshot what the system was suggesting at the moment of the decision.
    // Only relevant when the status itself is being changed.
    let snapshot: TrilhaSugestaoSnapshot | null = null;
    if (d.status != null) {
      snapshot = await computeStageSuggestion(clinic, def);
    }

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(trilhaEtapasTable)
        .where(
          and(
            eq(trilhaEtapasTable.clinicId, clinicId),
            eq(trilhaEtapasTable.etapaKey, etapaKey),
          ),
        )
        .limit(1);

      const updates: Partial<typeof trilhaEtapasTable.$inferInsert> = {
        updatedAt: new Date(),
      };
      let statusChanged = false;
      if (d.status != null && d.status !== existing?.status) {
        statusChanged = true;
        updates.status = d.status;
        updates.dataConcluida = d.status === "concluido" ? new Date() : null;
        updates.confirmadoPor = actor;
        updates.confirmadoEm = new Date();
        if (snapshot) updates.sugestaoSnapshot = snapshot;
      }
      if (d.responsavel !== undefined) updates.responsavel = d.responsavel;
      if (d.dataPrevista !== undefined) updates.dataPrevista = d.dataPrevista;
      if (d.observacao !== undefined) updates.observacao = d.observacao;

      await tx
        .update(trilhaEtapasTable)
        .set(updates)
        .where(
          and(
            eq(trilhaEtapasTable.clinicId, clinicId),
            eq(trilhaEtapasTable.etapaKey, etapaKey),
          ),
        );

      await recomputeClinicProgress(tx, clinicId);

      let descricao = `Etapa "${def.titulo}" atualizada por ${actor}.`;
      if (statusChanged && d.status != null) {
        descricao =
          `Etapa "${def.titulo}" marcada como "${STATUS_LABEL[d.status] ?? d.status}" por ${actor}.` +
          (d.observacao ? ` Obs.: ${d.observacao}` : "");
      }
      await tx.insert(clinicActivityTable).values({
        clinicId,
        tipo: "trilha",
        titulo: "Trilha de Implementação",
        descricao,
        autorNome: actor,
      });
    });

    const trilha = await loadTrilha(clinicId);
    res.json(UpdateTrilhaEtapaResponse.parse(trilha));
  },
);

export default router;
