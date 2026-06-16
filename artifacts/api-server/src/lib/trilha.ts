import { eq, and, count, isNotNull, type SQL } from "drizzle-orm";
import { type PgTable } from "drizzle-orm/pg-core";
import {
  db,
  clinicsTable,
  trilhaEtapasTable,
  docsConstitutivoTable,
  lgpdSignatureRequestsTable,
  kickoffsTable,
  teamTable,
  parceirosExternosTable,
  sistemasUsoTable,
  delegacoesTable,
  diagnosticsTable,
  risksTable,
  actionsTable,
  type Clinic,
  type TrilhaSugestaoSnapshot,
} from "@workspace/db";
import {
  TRILHA_ETAPAS,
  computeTrilhaSummary,
  type TrilhaEtapaDef,
  type TrilhaEtapaStatus,
} from "@workspace/trilha";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Live, derived signals for one clinic used by the suggestion engine. */
interface TrilhaSignals {
  status: string;
  propostaUrl: string | null;
  contratoUrl: string | null;
  docsCount: number;
  lgpdAssinadoCount: number;
  kickoffExists: boolean;
  teamCount: number;
  parceirosCount: number;
  sistemasCount: number;
  delegacoesEnviadasCount: number;
  diagnosticoConcluidoCount: number;
  risksCount: number;
  actionsCount: number;
}

async function countRows(table: PgTable, where: SQL | undefined): Promise<number> {
  const [row] = await db.select({ c: count() }).from(table).where(where);
  return Number(row?.c ?? 0);
}

function nonEmpty(s: string | null | undefined): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

const PROPOSAL_OR_BEYOND = new Set(["proposta", "contrato", "trial", "ativa"]);
const CONTRACT_OR_BEYOND = new Set(["contrato", "trial", "ativa"]);

/** Gather the live signals for a clinic in parallel. */
async function gatherSignals(clinic: Clinic): Promise<TrilhaSignals> {
  const cid = clinic.id;
  const [
    docsCount,
    lgpdAssinadoCount,
    kickoffCount,
    teamCount,
    parceirosCount,
    sistemasCount,
    delegacoesEnviadasCount,
    diagnosticoConcluidoCount,
    risksCount,
    actionsCount,
  ] = await Promise.all([
    countRows(
      docsConstitutivoTable,
      and(
        eq(docsConstitutivoTable.clinicId, cid),
        isNotNull(docsConstitutivoTable.storagePath),
      ),
    ),
    countRows(
      lgpdSignatureRequestsTable,
      and(
        eq(lgpdSignatureRequestsTable.clinicId, cid),
        eq(lgpdSignatureRequestsTable.status, "assinado"),
      ),
    ),
    countRows(kickoffsTable, eq(kickoffsTable.clinicId, cid)),
    countRows(teamTable, eq(teamTable.clinicId, cid)),
    countRows(parceirosExternosTable, eq(parceirosExternosTable.clinicId, cid)),
    countRows(sistemasUsoTable, eq(sistemasUsoTable.clinicId, cid)),
    countRows(
      delegacoesTable,
      and(
        eq(delegacoesTable.clinicId, cid),
        isNotNull(delegacoesTable.inviteSentAt),
      ),
    ),
    countRows(
      diagnosticsTable,
      and(
        eq(diagnosticsTable.clinicId, cid),
        eq(diagnosticsTable.status, "concluido"),
      ),
    ),
    countRows(risksTable, eq(risksTable.clinicId, cid)),
    countRows(actionsTable, eq(actionsTable.clinicId, cid)),
  ]);

  return {
    status: clinic.status,
    propostaUrl: clinic.propostaUrl,
    contratoUrl: clinic.contratoUrl,
    docsCount,
    lgpdAssinadoCount,
    kickoffExists: kickoffCount > 0,
    teamCount,
    parceirosCount,
    sistemasCount,
    delegacoesEnviadasCount,
    diagnosticoConcluidoCount,
    risksCount,
    actionsCount,
  };
}

/**
 * The hybrid suggestion engine. Given a stage definition and the clinic's live
 * signals, decide whether the system suggests "pronto para concluir" and why.
 * This NEVER concludes a stage on its own — it only produces a hint a human
 * confirms. Manual marcos (no backing module) never get an automatic
 * suggestion.
 */
function computeSuggestion(
  def: TrilhaEtapaDef,
  s: TrilhaSignals,
): { pronto: boolean; motivo: string } {
  switch (def.key) {
    case "pre_cadastro":
      return { pronto: true, motivo: "Clínica cadastrada na plataforma." };
    case "proposta":
      if (nonEmpty(s.propostaUrl))
        return { pronto: true, motivo: "Proposta comercial anexada." };
      if (PROPOSAL_OR_BEYOND.has(s.status))
        return { pronto: true, motivo: `Status da clínica: ${s.status}.` };
      return { pronto: false, motivo: "Anexe a proposta ou avance o status." };
    case "contrato":
      if (nonEmpty(s.contratoUrl))
        return { pronto: true, motivo: "Contrato anexado." };
      if (CONTRACT_OR_BEYOND.has(s.status))
        return { pronto: true, motivo: `Status da clínica: ${s.status}.` };
      return { pronto: false, motivo: "Anexe o contrato assinado." };
    case "docs_constitutivos":
      return s.docsCount > 0
        ? {
            pronto: true,
            motivo: `${s.docsCount} documento(s) constitutivo(s) enviado(s).`,
          }
        : { pronto: false, motivo: "Nenhum documento constitutivo enviado." };
    case "lgpd":
      return s.lgpdAssinadoCount > 0
        ? {
            pronto: true,
            motivo: `${s.lgpdAssinadoCount} termo(s) LGPD assinado(s).`,
          }
        : { pronto: false, motivo: "Nenhum termo LGPD assinado." };
    case "kickoff": {
      const ok =
        s.kickoffExists &&
        s.teamCount > 0 &&
        s.sistemasCount > 0 &&
        s.parceirosCount > 0;
      if (ok)
        return {
          pronto: true,
          motivo: `Kick-off registrado (${s.teamCount} da equipe, ${s.parceirosCount} parceiro(s), ${s.sistemasCount} sistema(s)).`,
        };
      const faltam: string[] = [];
      if (!s.kickoffExists) faltam.push("kick-off");
      if (s.teamCount === 0) faltam.push("equipe interna");
      if (s.parceirosCount === 0) faltam.push("rede externa");
      if (s.sistemasCount === 0) faltam.push("sistemas");
      return { pronto: false, motivo: `Pendente: ${faltam.join(", ")}.` };
    }
    case "envio_diagnostico":
      return s.delegacoesEnviadasCount > 0
        ? {
            pronto: true,
            motivo: `${s.delegacoesEnviadasCount} link(s) de diagnóstico enviado(s).`,
          }
        : { pronto: false, motivo: "Nenhum link de diagnóstico enviado." };
    case "recebimento_diagnostico":
      return s.diagnosticoConcluidoCount > 0
        ? {
            pronto: true,
            motivo: `${s.diagnosticoConcluidoCount} diagnóstico(s) concluído(s).`,
          }
        : { pronto: false, motivo: "Nenhum diagnóstico concluído." };
    case "mapa_riscos":
      return s.risksCount > 0
        ? { pronto: true, motivo: `${s.risksCount} risco(s) cadastrado(s).` }
        : { pronto: false, motivo: "Nenhum risco cadastrado." };
    case "plano_acao":
      return s.actionsCount > 0
        ? { pronto: true, motivo: `${s.actionsCount} ação(ões) no plano.` }
        : { pronto: false, motivo: "Nenhuma ação cadastrada." };
    case "painel_gestao":
      return s.status === "ativa"
        ? { pronto: true, motivo: "Clínica ativa — painel de gestão em uso." }
        : { pronto: false, motivo: "Ative a clínica para liberar o painel." };
    default:
      // Manual marcos: avaliacao, montagem_painel, treinamento, acompanhamento.
      return {
        pronto: false,
        motivo: "Etapa de confirmação manual — sem sugestão automática.",
      };
  }
}

/**
 * Idempotently ensure a clinic has one row per trilha stage. Brand-new rows
 * are created as `pendente` — the system never auto-concludes on read. Safe to
 * call on every GET and safe under concurrency (unique constraint + on-conflict
 * do nothing).
 */
export async function materializeTrilha(clinicId: string): Promise<void> {
  await db
    .insert(trilhaEtapasTable)
    .values(
      TRILHA_ETAPAS.map((e) => ({
        clinicId,
        etapaKey: e.key,
        ordem: e.ordem,
        status: "pendente" as TrilhaEtapaStatus,
      })),
    )
    .onConflictDoNothing({
      target: [trilhaEtapasTable.clinicId, trilhaEtapasTable.etapaKey],
    });
}

export interface TrilhaEtapaView {
  key: string;
  ordem: number;
  titulo: string;
  descricao: string;
  modulo: string | null;
  manual: boolean;
  status: TrilhaEtapaStatus;
  responsavel: string | null;
  dataPrevista: string | null;
  dataConcluida: string | null;
  observacao: string | null;
  sugestao: TrilhaSugestaoSnapshot;
  confirmadoPor: string | null;
  confirmadoEm: string | null;
}

export interface TrilhaView {
  clinicId: string;
  etapas: TrilhaEtapaView[];
  resumo: { etapa: number; progresso: number; resolvidas: number; total: number };
}

/**
 * Pure read of a clinic's trilha: materialize missing rows, then merge the
 * persisted per-stage state with the fixed catalog and a freshly computed live
 * suggestion. Does not persist suggestions (snapshots are written only on
 * PATCH) and does not mutate clinics.etapa/progresso.
 */
export async function loadTrilha(clinicId: string): Promise<TrilhaView | null> {
  const [clinic] = await db
    .select()
    .from(clinicsTable)
    .where(eq(clinicsTable.id, clinicId))
    .limit(1);
  if (!clinic) return null;

  await materializeTrilha(clinicId);

  const [rows, signals] = await Promise.all([
    db
      .select()
      .from(trilhaEtapasTable)
      .where(eq(trilhaEtapasTable.clinicId, clinicId)),
    gatherSignals(clinic),
  ]);

  const rowByKey = new Map(rows.map((r) => [r.etapaKey, r]));
  const statusesByKey: Record<string, TrilhaEtapaStatus> = {};
  const computedAt = new Date().toISOString();

  const etapas: TrilhaEtapaView[] = TRILHA_ETAPAS.map((def) => {
    const row = rowByKey.get(def.key);
    const status = (row?.status ?? "pendente") as TrilhaEtapaStatus;
    statusesByKey[def.key] = status;
    const sug = computeSuggestion(def, signals);
    return {
      key: def.key,
      ordem: def.ordem,
      titulo: def.titulo,
      descricao: def.descricao,
      modulo: def.modulo,
      manual: def.manual,
      status,
      responsavel: row?.responsavel ?? null,
      dataPrevista: row?.dataPrevista ?? null,
      dataConcluida: row?.dataConcluida
        ? row.dataConcluida.toISOString()
        : null,
      observacao: row?.observacao ?? null,
      sugestao: { pronto: sug.pronto, motivo: sug.motivo, computedAt },
      confirmadoPor: row?.confirmadoPor ?? null,
      confirmadoEm: row?.confirmadoEm ? row.confirmadoEm.toISOString() : null,
    };
  });

  const resumo = computeTrilhaSummary(statusesByKey);
  return { clinicId, etapas, resumo };
}

/**
 * Compute the live suggestion snapshot for a single stage. Used by PATCH to
 * record what the system was suggesting at the moment a human made a decision.
 */
export async function computeStageSuggestion(
  clinic: Clinic,
  def: TrilhaEtapaDef,
): Promise<TrilhaSugestaoSnapshot> {
  const signals = await gatherSignals(clinic);
  const sug = computeSuggestion(def, signals);
  return { pronto: sug.pronto, motivo: sug.motivo, computedAt: new Date().toISOString() };
}

/**
 * Recompute the clinic-level derived fields (etapa + progresso) from the
 * confirmed per-stage statuses and persist them. Runs inside the PATCH
 * transaction so the card/panel stay in lockstep with the stepper.
 */
export async function recomputeClinicProgress(
  tx: DbTx,
  clinicId: string,
): Promise<{ etapa: number; progresso: number }> {
  const rows = await tx
    .select({
      etapaKey: trilhaEtapasTable.etapaKey,
      status: trilhaEtapasTable.status,
    })
    .from(trilhaEtapasTable)
    .where(eq(trilhaEtapasTable.clinicId, clinicId));

  const statusesByKey: Record<string, TrilhaEtapaStatus> = {};
  for (const r of rows) statusesByKey[r.etapaKey] = r.status as TrilhaEtapaStatus;

  const { etapa, progresso } = computeTrilhaSummary(statusesByKey);
  await tx
    .update(clinicsTable)
    .set({ etapa, progresso, updatedAt: new Date() })
    .where(eq(clinicsTable.id, clinicId));
  return { etapa, progresso };
}

/**
 * Materialize the 15 trilha rows (all as `pendente`) for clinics that don't
 * have them yet, then recompute clinics.etapa/progresso so the gestor/portal
 * cards reflect the new trilha-derived model immediately — even before anyone
 * opens the clinic — instead of the unreliable legacy hand-typed `etapa`.
 *
 * HYBRID rule: this NEVER concludes a stage. The suggestion engine still runs
 * live on GET to flag stages "pronto para concluir", but only an explicit
 * consultant PATCH can move a stage to `concluido`. A freshly seeded clinic
 * therefore recomputes to progresso=0 / etapa=1 until a consultant confirms.
 *
 * Idempotent: clinics that already have rows are skipped. Runs before the
 * server accepts traffic, so it cannot race the GET materializer.
 */
export async function backfillTrilha(): Promise<number> {
  const [allClinics, withRows] = await Promise.all([
    db.select({ id: clinicsTable.id }).from(clinicsTable),
    db
      .selectDistinct({ clinicId: trilhaEtapasTable.clinicId })
      .from(trilhaEtapasTable),
  ]);
  const seeded = new Set(withRows.map((r) => r.clinicId));
  const todo = allClinics.filter((c) => !seeded.has(c.id));

  for (const clinic of todo) {
    const values = TRILHA_ETAPAS.map((def) => ({
      clinicId: clinic.id,
      etapaKey: def.key,
      ordem: def.ordem,
      status: "pendente" as TrilhaEtapaStatus,
    }));

    await db.transaction(async (tx) => {
      await tx
        .insert(trilhaEtapasTable)
        .values(values)
        .onConflictDoNothing({
          target: [trilhaEtapasTable.clinicId, trilhaEtapasTable.etapaKey],
        });
      await recomputeClinicProgress(tx, clinic.id);
    });
  }

  return todo.length;
}
