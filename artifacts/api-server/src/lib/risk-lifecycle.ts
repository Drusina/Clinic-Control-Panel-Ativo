import { eq } from "drizzle-orm";
import { db, risksTable, actionsTable } from "@workspace/db";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Status that is a human override: the automation NEVER touches a risk in this
 * state. Only an explicit PATCH back to another status (or "Aceitar") clears it.
 */
export const PROTECTED_RISK_STATUS = "nao_aceito";

export type BoardDrivenStatus = "identificado" | "em_mitigacao" | "mitigado";

/** Maps a risk's severidade (P×I) to a Plano de Ação priority. */
export function severidadeToPrioridade(sev: number): "alta" | "media" | "baixa" {
  if (sev >= 15) return "alta";
  if (sev >= 7) return "media";
  return "baixa";
}

/**
 * Derives a risk's status from the Kanban columns of its linked action cards
 * (the board is the source of truth):
 *   - all cards "done"          → mitigado
 *   - all cards still "backlog" → identificado
 *   - anything in between       → em_mitigacao
 * Returns null when there are NO linked cards — such a risk stays manual and the
 * automation must not change it.
 */
export function statusFromBoard(colunas: string[]): BoardDrivenStatus | null {
  if (colunas.length === 0) return null;
  if (colunas.every((c) => c === "done")) return "mitigado";
  if (colunas.every((c) => c === "backlog")) return "identificado";
  return "em_mitigacao";
}

/**
 * Reconciles a single risk's status from its linked Plano de Ação cards. Skips
 * the protected "nao_aceito" override and any risk without linked cards. Writes
 * only on a real transition (idempotent), clearing any stale justificativa.
 */
export async function reconcileRiskStatus(tx: DbTx, riskId: string): Promise<void> {
  const [risk] = await tx
    .select({ status: risksTable.status })
    .from(risksTable)
    .where(eq(risksTable.id, riskId));
  if (!risk || risk.status === PROTECTED_RISK_STATUS) return;

  const actions = await tx
    .select({ coluna: actionsTable.coluna })
    .from(actionsTable)
    .where(eq(actionsTable.riscoOrigemId, riskId));

  const next = statusFromBoard(actions.map((a) => a.coluna));
  if (next === null || next === risk.status) return;

  await tx
    .update(risksTable)
    .set({ status: next, statusJustificativa: null })
    .where(eq(risksTable.id, riskId));
}

/**
 * One-time idempotent remap of the retired "aceito" status. "Aceito" no longer
 * participates in the lifecycle — accepting a risk now creates a backlog card
 * and the status follows the board. Legacy rows are reset to "identificado" so
 * they re-enter the triage flow (Aceitar / Descartar). Replica-safe.
 */
export async function remapLegacyAceitoStatus(): Promise<number> {
  const result = await db
    .update(risksTable)
    .set({ status: "identificado" })
    .where(eq(risksTable.status, "aceito"))
    .returning({ id: risksTable.id });
  return result.length;
}
