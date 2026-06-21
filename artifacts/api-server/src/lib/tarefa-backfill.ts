import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Migrate legacy `acao_checklist_itens` rows into `acao_tarefas` (Fase 3).
 *
 * Each checklist item becomes one top-level tarefa: `texto` → `titulo`,
 * `feito` → status (`concluida`/`a_fazer`), preserving `ordem`. The original
 * checklist rows are NEVER deleted — they stay intact in the database; this
 * migration is purely additive.
 *
 * Idempotency: each generated tarefa carries `origem_checklist_id` (the source
 * item id), guarded by a partial UNIQUE index. The INSERT only picks items that
 * do not yet have a tarefa, so re-running on every boot is a no-op once done and
 * safe across concurrent replicas.
 *
 * For migrated completed items we use the checklist item's `created_at` as a
 * stable proxy for `concluida_em` (the real completion time is unknown), which
 * avoids skewing "recently completed" views with the migration timestamp.
 */
export async function backfillAcaoChecklistToTarefas(): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO acao_tarefas (acao_id, titulo, status, ordem, origem_checklist_id, concluida_em)
    SELECT
      c.acao_id,
      c.texto,
      CASE WHEN c.feito THEN 'concluida' ELSE 'a_fazer' END,
      c.ordem,
      c.id,
      CASE WHEN c.feito THEN c.created_at ELSE NULL END
    FROM acao_checklist_itens c
    WHERE NOT EXISTS (
      SELECT 1 FROM acao_tarefas t WHERE t.origem_checklist_id = c.id
    )
    ON CONFLICT (origem_checklist_id) WHERE origem_checklist_id IS NOT NULL DO NOTHING
  `);
  return (result as { rowCount?: number }).rowCount ?? 0;
}
