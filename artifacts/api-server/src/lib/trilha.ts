import {
  eq,
  and,
  or,
  exists,
  sql,
  count,
  countDistinct,
  isNotNull,
  inArray,
  type SQL,
} from "drizzle-orm";
import { type PgTable } from "drizzle-orm/pg-core";
import {
  db,
  clinicsTable,
  trilhaEtapasTable,
  docsConstitutivoTable,
  docsConstitutivoFilesTable,
  societaryExtractionsTable,
  lgpdTermosTable,
  clinicActivityTable,
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
import { TEMPLATE_SLUGS } from "./lgpd-templates.js";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Actor name recorded when the system auto-concludes/reopens a stage. */
const SYSTEM_ACTOR = "Sistema (automático)";

/** Total LGPD/contractual documents required to complete the LGPD stage. */
const LGPD_TOTAL = TEMPLATE_SLUGS.length;

/** Live, derived signals for one clinic used by the suggestion engine. */
interface TrilhaSignals {
  status: string;
  propostaUrl: string | null;
  contratoUrl: string | null;
  docsCount: number;
  lgpdFormalizadosCount: number;
  kickoffExists: boolean;
  teamCount: number;
  parceirosCount: number;
  sistemasCount: number;
  delegacoesEnviadasCount: number;
  diagnosticoConcluidoCount: number;
  risksCount: number;
  actionsCount: number;
  managerActiveCount: number;
}

async function countRows(table: PgTable, where: SQL | undefined): Promise<number> {
  const [row] = await db.select({ c: count() }).from(table).where(where);
  return Number(row?.c ?? 0);
}

/**
 * Count how many of the required LGPD templates a clinic has formalized. Counts
 * DISTINCT slugs (not rows) so duplicate rows for the same template can never
 * push the total to 6 while a required template is still missing.
 */
async function countLgpdFormalizados(cid: string): Promise<number> {
  const [row] = await db
    .select({ c: countDistinct(lgpdTermosTable.slug) })
    .from(lgpdTermosTable)
    .where(
      and(
        eq(lgpdTermosTable.clinicId, cid),
        inArray(lgpdTermosTable.slug, TEMPLATE_SLUGS),
        inArray(lgpdTermosTable.status, ["assinado", "anexado"]),
      ),
    );
  return Number(row?.c ?? 0);
}

/**
 * Count the constitutive documents a clinic has on file, across ALL real upload
 * surfaces. A clinic can populate this stage through three independent paths:
 *   1. Legacy single-file slot — `docs_constitutivos.storage_path` is set.
 *   2. Multi-file slot — files live in child `docs_constitutivos_files` rows
 *      while the parent `storage_path` stays NULL.
 *   3. "Documentos Societários (com análise por IA)" — writes to
 *      `societary_extractions` (+ `clinic_documents`), never `docs_constitutivos`.
 * The previous signal only counted path 1, so clinics that uploaded via paths 2
 * or 3 were stuck on "Pendente". The two sources are disjoint tables, so no row
 * is ever counted twice (a clinic that happens to use both features just shows a
 * higher total — only the `docsCount > 0` completion check matters here).
 */
async function countConstitutiveDocs(cid: string): Promise<number> {
  const [docsRow, societaryRow] = await Promise.all([
    db
      .select({ c: count() })
      .from(docsConstitutivoTable)
      .where(
        and(
          eq(docsConstitutivoTable.clinicId, cid),
          or(
            isNotNull(docsConstitutivoTable.storagePath),
            exists(
              db
                .select({ x: sql`1` })
                .from(docsConstitutivoFilesTable)
                .where(
                  eq(docsConstitutivoFilesTable.docId, docsConstitutivoTable.id),
                ),
            ),
          ),
        ),
      ),
    db
      .select({ c: count() })
      .from(societaryExtractionsTable)
      .where(eq(societaryExtractionsTable.clinicId, cid)),
  ]);
  return Number(docsRow[0]?.c ?? 0) + Number(societaryRow[0]?.c ?? 0);
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
    lgpdFormalizadosCount,
    kickoffCount,
    teamCount,
    parceirosCount,
    sistemasCount,
    delegacoesEnviadasCount,
    diagnosticoConcluidoCount,
    risksCount,
    actionsCount,
    managerActiveCount,
  ] = await Promise.all([
    countConstitutiveDocs(cid),
    countLgpdFormalizados(cid),
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
    countRows(
      teamTable,
      and(
        eq(teamTable.clinicId, cid),
        eq(teamTable.temAcessoPlataforma, true),
        isNotNull(teamTable.lastAccessAt),
      ),
    ),
  ]);

  return {
    status: clinic.status,
    propostaUrl: clinic.propostaUrl,
    contratoUrl: clinic.contratoUrl,
    docsCount,
    lgpdFormalizadosCount,
    kickoffExists: kickoffCount > 0,
    teamCount,
    parceirosCount,
    sistemasCount,
    delegacoesEnviadasCount,
    diagnosticoConcluidoCount,
    risksCount,
    actionsCount,
    managerActiveCount,
  };
}

/**
 * The signal engine. Given a stage definition and the clinic's live signals,
 * decide whether the data shows the stage is "pronto" (satisfied) and why. The
 * `motivo` is surfaced in the UI (e.g. the LGPD "X de N termos formalizados"
 * line) and also drives automatic conclusion in `reconcileTrilha`. Manual
 * marcos (no backing module) are never auto-derived — they always return
 * `pronto: false`.
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
    case "lgpd": {
      const n = s.lgpdFormalizadosCount;
      return n >= LGPD_TOTAL
        ? {
            pronto: true,
            motivo: `${LGPD_TOTAL} de ${LGPD_TOTAL} termos formalizados.`,
          }
        : {
            pronto: false,
            motivo: `${n} de ${LGPD_TOTAL} termos formalizados.`,
          };
    }
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
      return s.managerActiveCount > 0
        ? {
            pronto: true,
            motivo: "Gestor com acesso ativo e primeiro acesso registrado.",
          }
        : {
            pronto: false,
            motivo: "Aguardando primeiro acesso do gestor ao painel.",
          };
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
 * are created as `pendente`; `reconcileTrilha` then derives the automatic
 * stages. Safe to call on every GET and safe under concurrency (unique
 * constraint + on-conflict do nothing).
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

type TrilhaEtapaRow = typeof trilhaEtapasTable.$inferSelect;

interface ReconcileResult {
  clinic: Clinic;
  signals: TrilhaSignals;
  rows: TrilhaEtapaRow[];
}

/**
 * Statuses a human sets as an explicit override. Reconciliation never touches
 * these — only the human can clear them (via a PATCH back to `pendente`).
 */
const OVERRIDE_STATUSES = new Set<TrilhaEtapaStatus>([
  "bloqueado",
  "nao_aplicavel",
]);

/**
 * Reconcile a clinic's AUTOMATIC (non-manual) trilha stages against the live
 * signals: every data-detectable stage whose signal is satisfied is concluded
 * by the system (no human click), and any previously auto-concluded stage whose
 * signal is no longer satisfied is reopened. Manual marcos and human overrides
 * (`bloqueado` / `nao_aplicavel`) are never touched. `clinics.etapa/progresso`
 * are recomputed in the same transaction.
 *
 * Idempotent: it writes only on a real status transition (or to repair stale
 * clinic progress), so it is cheap and safe to call on every GET and at boot.
 * Returns the clinic, the gathered signals, and the post-reconcile rows so the
 * caller can build the view without a second signal/row fetch.
 */
export async function reconcileTrilha(
  clinicId: string,
): Promise<ReconcileResult | null> {
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

  interface Transition {
    def: TrilhaEtapaDef;
    from: TrilhaEtapaStatus;
    to: "concluido" | "pendente";
    motivo: string;
  }
  const transitions: Transition[] = [];
  const finalStatuses: Record<string, TrilhaEtapaStatus> = {};

  for (const def of TRILHA_ETAPAS) {
    const current = (rowByKey.get(def.key)?.status ??
      "pendente") as TrilhaEtapaStatus;
    finalStatuses[def.key] = current;
    if (def.manual || OVERRIDE_STATUSES.has(current)) continue;
    // Non-manual, non-override stages are fully derived from live data, so the
    // desired status is purely a function of the signal. Anything else (a
    // legacy/API-set `em_andamento`, a stale `concluido`, a `pendente` whose
    // signal is now ready) is normalized to that derived value.
    const sug = computeSuggestion(def, signals);
    const desired: "concluido" | "pendente" = sug.pronto
      ? "concluido"
      : "pendente";
    if (current !== desired) {
      transitions.push({ def, from: current, to: desired, motivo: sug.motivo });
      finalStatuses[def.key] = desired;
    }
  }

  const summary = computeTrilhaSummary(finalStatuses);
  const progressStale =
    clinic.etapa !== summary.etapa || clinic.progresso !== summary.progresso;

  if (transitions.length === 0 && !progressStale) {
    return { clinic, signals, rows };
  }

  await db.transaction(async (tx) => {
    const now = new Date();
    for (const t of transitions) {
      // Guard the update on the EXACT status we observed (`t.from`). If a
      // concurrent reconcile already applied this transition, or a human
      // override raced in, the predicate matches zero rows and we skip the
      // activity insert — keeping reconcile idempotent and concurrency-safe.
      const baseWhere = and(
        eq(trilhaEtapasTable.clinicId, clinicId),
        eq(trilhaEtapasTable.etapaKey, t.def.key),
        eq(trilhaEtapasTable.status, t.from),
      );
      let changed: { id: string }[];
      if (t.to === "concluido") {
        const snapshot: TrilhaSugestaoSnapshot = {
          pronto: true,
          motivo: t.motivo,
          computedAt: now.toISOString(),
        };
        changed = await tx
          .update(trilhaEtapasTable)
          .set({
            status: "concluido",
            dataConcluida: now,
            confirmadoPor: SYSTEM_ACTOR,
            confirmadoEm: now,
            sugestaoSnapshot: snapshot,
            updatedAt: now,
          })
          .where(baseWhere)
          .returning({ id: trilhaEtapasTable.id });
      } else {
        changed = await tx
          .update(trilhaEtapasTable)
          .set({
            status: "pendente",
            dataConcluida: null,
            confirmadoPor: null,
            confirmadoEm: null,
            sugestaoSnapshot: null,
            updatedAt: now,
          })
          .where(baseWhere)
          .returning({ id: trilhaEtapasTable.id });
      }
      if (changed.length === 0) continue;
      await tx.insert(clinicActivityTable).values({
        clinicId,
        tipo: "trilha",
        titulo: "Trilha de Implementação",
        descricao:
          t.to === "concluido"
            ? `Etapa "${t.def.titulo}" concluída automaticamente pelo sistema (${t.motivo}).`
            : `Etapa "${t.def.titulo}" reaberta automaticamente — condição não mais atendida (${t.motivo}).`,
        autorNome: SYSTEM_ACTOR,
      });
    }
    await recomputeClinicProgress(tx, clinicId);
  });

  const freshRows =
    transitions.length > 0
      ? await db
          .select()
          .from(trilhaEtapasTable)
          .where(eq(trilhaEtapasTable.clinicId, clinicId))
      : rows;

  return { clinic, signals, rows: freshRows };
}

/**
 * Read a clinic's trilha for the API: reconcile the automatic stages first (so
 * data-detectable stages are already concluded — no human click), then merge
 * the persisted per-stage state with the fixed catalog and the live signal
 * `motivo` shown in the UI.
 */
export async function loadTrilha(clinicId: string): Promise<TrilhaView | null> {
  const reconciled = await reconcileTrilha(clinicId);
  if (!reconciled) return null;
  const { signals, rows } = reconciled;

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
 * Reconcile EVERY clinic's trilha at boot: materialize missing rows, auto-
 * conclude the data-detectable stages, reopen any whose signal lapsed, and
 * recompute clinics.etapa/progresso — so the gestor/portal cards reflect the
 * trilha-derived model immediately, even before anyone opens the clinic.
 *
 * AUTO rule: a clinic that already has its data (cadastro, contrato, 6/6 LGPD
 * termos, etc.) shows those stages as `concluido` without any consultant click;
 * `reconcileTrilha` is the single source of truth and is also re-run on every
 * GET. Idempotent and safe under concurrency. Runs before the server accepts
 * traffic, so it cannot race the GET reconciler.
 */
export async function backfillTrilha(): Promise<number> {
  const allClinics = await db
    .select({ id: clinicsTable.id })
    .from(clinicsTable);

  for (const clinic of allClinics) {
    await reconcileTrilha(clinic.id);
  }

  return allClinics.length;
}
