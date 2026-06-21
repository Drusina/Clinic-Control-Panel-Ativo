import { and, eq, isNull } from "drizzle-orm";
import { db, acaoTarefasTable } from "@workspace/db";

/** A Drizzle transaction handle (same shape used across the server). */
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const MAX_SUGGESTED_TAREFAS = 12;
export const MAX_TAREFA_TITULO_LEN = 200;

/**
 * Normaliza uma lista de títulos de tarefa sugeridos antes de persistir:
 * trim, colapsa espaços internos, trunca em MAX_TAREFA_TITULO_LEN, remove
 * vazios, deduplica (case-insensitive) e limita a MAX_SUGGESTED_TAREFAS itens.
 *
 * NUNCA lança — entrada inválida (não-array, itens não-string) vira `[]`. Isso
 * é proposital: tarefas sugeridas são um "nice to have" e jamais devem quebrar
 * a criação da ação que as origina.
 */
export function sanitizeTarefaTitles(titles: unknown): string[] {
  if (!Array.isArray(titles)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of titles) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().replace(/\s+/g, " ").slice(0, MAX_TAREFA_TITULO_LEN);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_SUGGESTED_TAREFAS) break;
  }
  return out;
}

/**
 * Insere tarefas top-level (somente título) para uma ação, anexadas após as
 * tarefas top-level já existentes (ordem sequencial). NÃO define responsável,
 * datas nem status — `status` cai no default "a_fazer". Os títulos são
 * sanitizados/deduplicados antes da inserção.
 *
 * Roda dentro de uma transação para manter "ação + tarefas" atômico. Retorna as
 * linhas criadas (vazio se não houver títulos válidos).
 */
export async function createSuggestedTarefas(
  tx: DbTx,
  acaoId: string,
  titles: unknown,
): Promise<(typeof acaoTarefasTable.$inferSelect)[]> {
  const clean = sanitizeTarefaTitles(titles);
  if (clean.length === 0) return [];

  const existing = await tx
    .select({ ordem: acaoTarefasTable.ordem })
    .from(acaoTarefasTable)
    .where(
      and(
        eq(acaoTarefasTable.acaoId, acaoId),
        isNull(acaoTarefasTable.parentTarefaId),
      ),
    );
  const startOrdem = existing.reduce((max, t) => Math.max(max, t.ordem), -1) + 1;

  return tx
    .insert(acaoTarefasTable)
    .values(
      clean.map((titulo, i) => ({
        acaoId,
        parentTarefaId: null,
        titulo,
        status: "a_fazer" as const,
        ordem: startOrdem + i,
      })),
    )
    .returning();
}
