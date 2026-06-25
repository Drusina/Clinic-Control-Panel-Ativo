import { eq } from "drizzle-orm";
import { db, risksTable, actionsTable } from "@workspace/db";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Status that is a human override: the automation NEVER touches a risk in this
 * state. Only an explicit PATCH back to another status (or "Aceitar") clears it.
 */
export const PROTECTED_RISK_STATUS = "nao_aceito";

export type BoardDrivenStatus = "aceito" | "em_mitigacao" | "mitigado";

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
 *   - all cards still "backlog" → aceito (tratamento decidido, ainda não iniciado)
 *   - anything in between       → em_mitigacao
 * Returns null when there are NO linked cards — the board says nothing, so the
 * caller decides: a manual PATCH preserves the current status, while a board
 * event (deleting the last card) resets to "identificado" via `resetWhenNoCards`
 * in `reconcileRiskStatus`.
 */
export function statusFromBoard(colunas: string[]): BoardDrivenStatus | null {
  if (colunas.length === 0) return null;
  if (colunas.every((c) => c === "done")) return "mitigado";
  if (colunas.every((c) => c === "backlog")) return "aceito";
  return "em_mitigacao";
}

/**
 * Reconciles a single risk's status from its linked Plano de Ação cards. Skips
 * the protected "nao_aceito" override. Writes only on a real transition
 * (idempotent), clearing any stale justificativa.
 *
 * When the risk has NO linked cards the board says nothing, so behaviour depends
 * on the caller:
 *   - default (manual PATCH on the risk): leave the status untouched, so a
 *     deliberately set manual status on a card-less risk is preserved.
 *   - `resetWhenNoCards` (a board event such as deleting the last card): return
 *     the risk to "identificado" (triagem), since the board no longer supports
 *     any elevated status.
 */
export async function reconcileRiskStatus(
  tx: DbTx,
  riskId: string,
  opts: { resetWhenNoCards?: boolean } = {},
): Promise<void> {
  const [risk] = await tx
    .select({ status: risksTable.status })
    .from(risksTable)
    .where(eq(risksTable.id, riskId));
  if (!risk || risk.status === PROTECTED_RISK_STATUS) return;

  const actions = await tx
    .select({ coluna: actionsTable.coluna })
    .from(actionsTable)
    .where(eq(actionsTable.riscoOrigemId, riskId));

  const derived = statusFromBoard(actions.map((a) => a.coluna));
  const next =
    derived ?? (opts.resetWhenNoCards ? "identificado" : null);
  if (next === null || next === risk.status) return;

  await tx
    .update(risksTable)
    .set({ status: next, statusJustificativa: null })
    .where(eq(risksTable.id, riskId));
}

/**
 * Boot-time idempotent backfill: re-derives the status of every risk that has at
 * least one linked Plano de Ação card from the board (the source of truth). This
 * heals rows that predate the board-driven "aceito" status (e.g. a risk with a
 * card sitting in `backlog` that was stuck on the legacy "identificado"). The
 * protected "nao_aceito" override and risks without linked cards are left
 * untouched by `reconcileRiskStatus` (a card-less risk keeps any manual status;
 * board events such as deleting the last card reset it via `resetWhenNoCards`).
 * Returns the number of rows actually changed. Replica-safe (each risk in its
 * own transaction).
 */
export async function backfillRiskStatuses(): Promise<number> {
  const linkedRows = await db
    .selectDistinct({ riscoOrigemId: actionsTable.riscoOrigemId })
    .from(actionsTable);
  const riskIds = linkedRows
    .map((row) => row.riscoOrigemId)
    .filter((v): v is string => v != null);

  let changed = 0;
  for (const riskId of riskIds) {
    const didChange = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ status: risksTable.status })
        .from(risksTable)
        .where(eq(risksTable.id, riskId));
      if (!before) return false;
      await reconcileRiskStatus(tx, riskId);
      const [after] = await tx
        .select({ status: risksTable.status })
        .from(risksTable)
        .where(eq(risksTable.id, riskId));
      return after != null && after.status !== before.status;
    });
    if (didChange) changed += 1;
  }
  return changed;
}
