import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, perfilOperacionalTable } from "@workspace/db";

const router: IRouter = Router();

function mapPerfil(p: typeof perfilOperacionalTable.$inferSelect) {
  return {
    clinicId: p.clinicId,
    faturamentoMensal: p.faturamentoMensal != null ? Number(p.faturamentoMensal) : null,
    ticketMedio: p.ticketMedio != null ? Number(p.ticketMedio) : null,
    pacientesAtivos: p.pacientesAtivos ?? null,
    atendimentosMes: p.atendimentosMes ?? null,
    especialidades: p.especialidades ?? [],
    horarioFuncionamento: p.horarioFuncionamento ?? null,
    modeloParticular: p.modeloParticular ?? 0,
    modeloConvenio: p.modeloConvenio ?? 0,
    modeloSus: p.modeloSus ?? 0,
    updatedAt: p.updatedAt.toISOString(),
  };
}

router.get("/clinics/:clinicId/perfil-operacional", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const [perfil] = await db.select().from(perfilOperacionalTable).where(eq(perfilOperacionalTable.clinicId, clinicId));
  if (!perfil) {
    res.status(404).json({ error: "Perfil operacional not found" });
    return;
  }

  res.json(mapPerfil(perfil));
});

router.put("/clinics/:clinicId/perfil-operacional", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const d = req.body;

  const existing = await db.select().from(perfilOperacionalTable).where(eq(perfilOperacionalTable.clinicId, clinicId));

  const values = {
    faturamentoMensal: d.faturamentoMensal != null ? String(d.faturamentoMensal) : null,
    ticketMedio: d.ticketMedio != null ? String(d.ticketMedio) : null,
    pacientesAtivos: d.pacientesAtivos ?? null,
    atendimentosMes: d.atendimentosMes ?? null,
    especialidades: d.especialidades ?? [],
    horarioFuncionamento: d.horarioFuncionamento ?? null,
    modeloParticular: d.modeloParticular ?? 0,
    modeloConvenio: d.modeloConvenio ?? 0,
    modeloSus: d.modeloSus ?? 0,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    const [perfil] = await db
      .update(perfilOperacionalTable)
      .set(values)
      .where(eq(perfilOperacionalTable.clinicId, clinicId))
      .returning();

    res.json(mapPerfil(perfil));
  } else {
    const [perfil] = await db
      .insert(perfilOperacionalTable)
      .values({ clinicId, ...values })
      .returning();

    res.json(mapPerfil(perfil));
  }
});

export default router;
