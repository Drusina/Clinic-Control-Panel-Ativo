import { Router, type IRouter } from "express";
import { eq, count, sum, desc } from "drizzle-orm";
import { db, clinicsTable, clinicActivityTable, actionsTable, diagnosticsTable, notificationsTable, faturasTable } from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetDashboardPipelineResponse,
  GetDashboardRecentActivityResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [
    totalClinics,
    clinicasAtivas,
    clinicasTrial,
    clinicasSuspensas,
    clinicasProspect,
    receitaMensal,
    inadimplentes,
    diagnosticosEmAndamento,
    acoesAtrasadas,
    notificacoesNaoLidas,
  ] = await Promise.all([
    db.select({ count: count() }).from(clinicsTable),
    db.select({ count: count() }).from(clinicsTable).where(eq(clinicsTable.status, "ativa")),
    db.select({ count: count() }).from(clinicsTable).where(eq(clinicsTable.status, "trial")),
    db.select({ count: count() }).from(clinicsTable).where(eq(clinicsTable.status, "suspensa")),
    db.select({ count: count() }).from(clinicsTable).where(eq(clinicsTable.status, "prospect")),
    db.select({ total: sum(clinicsTable.valorRecorrente) }).from(clinicsTable).where(eq(clinicsTable.status, "ativa")),
    db.select({ count: count() }).from(faturasTable).where(eq(faturasTable.status, "atrasado")),
    db.select({ count: count() }).from(diagnosticsTable).where(eq(diagnosticsTable.status, "em_andamento")),
    db.select({ count: count() }).from(actionsTable).where(eq(actionsTable.coluna, "doing")),
    db.select({ count: count() }).from(notificationsTable).where(eq(notificationsTable.lida, false)),
  ]);

  const pipelineData = await db
    .select({ count: count(), valor: sum(clinicsTable.valorRecorrente) })
    .from(clinicsTable)
    .where(eq(clinicsTable.status, "proposta"));

  const receitaPipeline = pipelineData[0]?.valor ? Number(pipelineData[0].valor) : 0;

  res.json(
    GetDashboardSummaryResponse.parse({
      totalClinics: totalClinics[0]?.count ?? 0,
      clinicasAtivas: clinicasAtivas[0]?.count ?? 0,
      clinicasTrial: clinicasTrial[0]?.count ?? 0,
      clinicasSuspensas: clinicasSuspensas[0]?.count ?? 0,
      clinicasProspect: clinicasProspect[0]?.count ?? 0,
      receitaMensalTotal: receitaMensal[0]?.total ? Number(receitaMensal[0].total) : 0,
      receitaPipeline,
      inadimplentes: inadimplentes[0]?.count ?? 0,
      diagnosticosEmAndamento: diagnosticosEmAndamento[0]?.count ?? 0,
      acoesAtrasadas: acoesAtrasadas[0]?.count ?? 0,
      notificacoesNaoLidas: notificacoesNaoLidas[0]?.count ?? 0,
    })
  );
});

router.get("/dashboard/pipeline", async (_req, res): Promise<void> => {
  const statuses = ["prospect", "proposta", "contrato", "trial", "ativa", "suspensa", "desativada"];

  const results = await Promise.all(
    statuses.map(async (s) => {
      const [row] = await db
        .select({ count: count(), valor: sum(clinicsTable.valorRecorrente) })
        .from(clinicsTable)
        .where(eq(clinicsTable.status, s));
      return {
        status: s,
        count: row?.count ?? 0,
        valor: row?.valor ? Number(row.valor) : 0,
      };
    })
  );

  res.json(GetDashboardPipelineResponse.parse(results));
});

router.get("/dashboard/recent-activity", async (_req, res): Promise<void> => {
  const activities = await db
    .select()
    .from(clinicActivityTable)
    .orderBy(clinicActivityTable.createdAt)
    .limit(20);

  res.json(
    GetDashboardRecentActivityResponse.parse(
      activities.reverse().map((a) => ({
        id: a.id,
        clinicId: a.clinicId,
        tipo: a.tipo,
        titulo: a.titulo,
        descricao: a.descricao,
        autorNome: a.autorNome,
        createdAt: a.createdAt.toISOString(),
      }))
    )
  );
});

router.get("/dashboard/diagnostics", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: diagnosticsTable.id,
      clinicId: diagnosticsTable.clinicId,
      clinicNome: clinicsTable.nome,
      versao: diagnosticsTable.versao,
      concluidoEm: diagnosticsTable.concluidoEm,
      scoreGlobal: diagnosticsTable.scoreGlobal,
      scoresPilares: diagnosticsTable.scoresPilares,
    })
    .from(diagnosticsTable)
    .innerJoin(clinicsTable, eq(diagnosticsTable.clinicId, clinicsTable.id))
    .where(eq(diagnosticsTable.status, "concluido"))
    .orderBy(desc(diagnosticsTable.concluidoEm))
    .limit(50);

  const mapped = rows
    .filter((r) => r.concluidoEm != null)
    .map((r) => ({
      id: r.id,
      clinicId: r.clinicId,
      clinicNome: r.clinicNome,
      versao: r.versao ?? 1,
      concluidoEm: r.concluidoEm!.toISOString(),
      scoreGlobal: r.scoreGlobal != null ? Number(r.scoreGlobal) : null,
      scoresPilares: r.scoresPilares as Record<string, number> | null,
    }));

  res.json(mapped);
});

export default router;
