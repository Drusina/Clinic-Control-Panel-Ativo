import { eq, sql } from "drizzle-orm";
import { db, actionsTable, clinicsTable, acaoTarefasTable } from "@workspace/db";
import { getTemplateForPlan } from "./ics-seed.js";
import { createSuggestedTarefas, sanitizeTarefaTitles } from "./tarefas.js";
import { suggestTarefasForAction } from "./tarefa-suggester.js";
import { logger } from "./logger.js";

/**
 * Origem das tarefas regeneradas de uma ação:
 * - "modelo": ação do plano padrão (match titulo+pilarSlug no template curado).
 * - "ia": geradas pela IA (ações de risco/manuais).
 * - "fallback": IA indisponível/falhou e foram usados modelos genéricos.
 */
export type RegenSource = "modelo" | "ia" | "fallback";

export interface RegenerateTarefasResult {
  /** Total de ações da clínica processadas. */
  actionsProcessed: number;
  /** Total de tarefas (top-level) criadas no backfill. */
  tarefasCreated: number;
  /** Quantidade de ações cujas tarefas vieram de cada origem. */
  bySource: Record<RegenSource, number>;
}

/**
 * Backfill único, acionável pelo super-admin: (re)gera as tarefas sugeridas
 * (somente títulos) de TODAS as ações já existentes de uma clínica.
 *
 * Origem por ação:
 * - Ações do plano padrão (match exato titulo+pilarSlug no template da clínica,
 *   via `getTemplateForPlan`) reaproveitam as tarefas curadas da biblioteca.
 * - Demais ações (risco/manual) usam a IA (`suggestTarefasForAction`, que já tem
 *   timeout + fallback curado/genérico e NUNCA lança), então o backfill nunca
 *   quebra mesmo sem chave de IA.
 *
 * As tarefas existentes de cada ação são SUBSTITUÍDAS (perda de dados aceitável
 * na fase de demonstração). Os demais campos da ação (coluna, responsável,
 * prazo, prioridade, pilar, risco de origem) são preservados — só as tarefas
 * mudam. Idempotente e seguro para re-rodar: para ações do plano padrão o
 * resultado é determinístico; para as demais, a lista é sempre regenerada sem
 * duplicar.
 *
 * As chamadas de IA rodam FORA da transação (são lentas); o replace
 * delete+insert roda numa transação por clínica, protegida por advisory lock
 * para evitar interleaving entre execuções concorrentes.
 */
export async function regenerateTarefasForClinic(
  clinicId: string,
): Promise<RegenerateTarefasResult> {
  const [clinic] = await db
    .select({ plano: clinicsTable.plano })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, clinicId))
    .limit(1);

  const template = await getTemplateForPlan(clinic?.plano);

  // Mapa de tarefas curadas por titulo+pilarSlug (mesma chave usada no seed),
  // só para ações de template que de fato têm tarefas curadas.
  const tarefasByKey = new Map<string, string[]>();
  for (const a of template.actions) {
    if (a.tarefas && a.tarefas.length > 0) {
      tarefasByKey.set(`${a.titulo}__${a.pilarSlug ?? ""}`, a.tarefas);
    }
  }

  const actions = await db
    .select()
    .from(actionsTable)
    .where(eq(actionsTable.clinicId, clinicId));

  // Fase 1 (fora da transação): decide títulos + origem por ação.
  const plan: { acaoId: string; titles: string[]; source: RegenSource }[] = [];
  for (const action of actions) {
    const curated = tarefasByKey.get(
      `${action.titulo}__${action.pilarSlug ?? ""}`,
    );
    if (curated && curated.length > 0) {
      plan.push({
        acaoId: action.id,
        titles: sanitizeTarefaTitles(curated),
        source: "modelo",
      });
      continue;
    }

    // Risco/manual → IA (com timeout + fallback embutidos). O try/catch é
    // defensivo: mesmo que algo inesperado escape, a ação fica sem tarefas em
    // vez de abortar o backfill inteiro.
    try {
      const result = await suggestTarefasForAction({
        titulo: action.titulo,
        descricao: action.descricao,
        pilarSlug: action.pilarSlug,
      });
      plan.push({
        acaoId: action.id,
        titles: result.tarefas,
        source: result.source === "ai" ? "ia" : "fallback",
      });
    } catch (err) {
      logger.warn(
        { err, acaoId: action.id, clinicId },
        "regenerateTarefasForClinic: suggester threw; skipping tarefas for action",
      );
      plan.push({ acaoId: action.id, titles: [], source: "fallback" });
    }
  }

  const result: RegenerateTarefasResult = {
    actionsProcessed: actions.length,
    tarefasCreated: 0,
    bySource: { modelo: 0, ia: 0, fallback: 0 },
  };

  // Fase 2 (transação): replace atômico por clínica.
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`regenerate-tarefas:${clinicId}`}))`,
    );
    for (const { acaoId, titles, source } of plan) {
      // REPLACE: apaga todas as tarefas da ação (subtarefas saem por cascade) e
      // recria a partir dos títulos sugeridos.
      await tx.delete(acaoTarefasTable).where(eq(acaoTarefasTable.acaoId, acaoId));
      if (titles.length === 0) continue;
      const created = await createSuggestedTarefas(tx, acaoId, titles);
      result.tarefasCreated += created.length;
      if (created.length > 0) result.bySource[source] += 1;
    }
  });

  return result;
}
