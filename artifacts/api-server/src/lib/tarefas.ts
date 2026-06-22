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

/** Próxima `ordem` top-level disponível para uma ação (append sequencial). */
async function nextTopLevelOrdem(tx: DbTx, acaoId: string): Promise<number> {
  const existing = await tx
    .select({ ordem: acaoTarefasTable.ordem })
    .from(acaoTarefasTable)
    .where(and(eq(acaoTarefasTable.acaoId, acaoId), isNull(acaoTarefasTable.parentTarefaId)));
  return existing.reduce((max, t) => Math.max(max, t.ordem), -1) + 1;
}

/** Subtarefa rastreável: título + a origem (resposta do diagnóstico) que a gerou. */
export type PlanoSubtarefa = {
  titulo: string;
  respostaOrigemId: string | null;
  origemPergunta: string | null;
  origemResposta: string | null;
};

/** Fase de um projeto estrutural: top-level encadeável + subtarefas-filhas. */
export type PlanoFase = {
  titulo: string;
  descricao: string | null;
  subtarefas: PlanoSubtarefa[];
};

/** Material das três camadas; o commit escolhe qual usar conforme a camada. */
export type PlanoMaterial = {
  tarefasSugeridas: string[];
  subtarefas: PlanoSubtarefa[];
  fases: PlanoFase[];
};

type Camada = "pontual" | "consolidada" | "estrutural";

function cleanSubtarefa(s: PlanoSubtarefa): PlanoSubtarefa | null {
  const titulo = s.titulo.trim().replace(/\s+/g, " ").slice(0, MAX_TAREFA_TITULO_LEN);
  if (!titulo) return null;
  return {
    titulo,
    respostaOrigemId: s.respostaOrigemId ?? null,
    origemPergunta: s.origemPergunta?.trim() || null,
    origemResposta: s.origemResposta?.trim() || null,
  };
}

/**
 * Cria as tarefas de uma ação gerada conforme a CAMADA (decidida no servidor):
 * - **pontual**: tarefas planas simples (somente título), via `createSuggestedTarefas`.
 * - **consolidada**: tarefas planas COM rastreabilidade (origem do diagnóstico).
 * - **estrutural**: fases top-level encadeadas por `dependeDeTarefaId` (a fase N+1
 *   depende da fase N) + subtarefas-filhas rastreáveis.
 *
 * Best-effort e tolerante: se o material da camada estiver vazio, cai na camada
 * mais simples disponível, de modo que a criação da ação nunca fica sem tarefas
 * por dados ruins da IA. Roda dentro da transação da criação da ação.
 */
export async function createPlanoTarefas(
  tx: DbTx,
  acaoId: string,
  camada: Camada,
  plano: PlanoMaterial,
): Promise<void> {
  if (camada === "estrutural") {
    const fases = plano.fases.filter((f) => f.titulo.trim()).slice(0, MAX_SUGGESTED_TAREFAS);
    if (fases.length > 0) {
      let ordem = await nextTopLevelOrdem(tx, acaoId);
      let prevFaseId: string | null = null;
      for (const fase of fases) {
        const inserted: { id: string }[] = await tx
          .insert(acaoTarefasTable)
          .values({
            acaoId,
            parentTarefaId: null,
            titulo: fase.titulo.trim().slice(0, MAX_TAREFA_TITULO_LEN),
            descricao: fase.descricao,
            status: "a_fazer" as const,
            ordem: ordem++,
            // Encadeamento sequencial: cada fase depende da anterior.
            dependeDeTarefaId: prevFaseId,
          })
          .returning({ id: acaoTarefasTable.id });
        const faseId = inserted[0].id;
        prevFaseId = faseId;

        const filhas = fase.subtarefas
          .map(cleanSubtarefa)
          .filter((s): s is PlanoSubtarefa => s !== null)
          .slice(0, MAX_SUGGESTED_TAREFAS);
        if (filhas.length > 0) {
          await tx.insert(acaoTarefasTable).values(
            filhas.map((s, i) => ({
              acaoId,
              parentTarefaId: faseId,
              titulo: s.titulo,
              status: "a_fazer" as const,
              ordem: i,
              respostaOrigemId: s.respostaOrigemId,
              origemPergunta: s.origemPergunta,
              origemResposta: s.origemResposta,
            })),
          );
        }
      }
      return;
    }
    // Sem fases válidas → degrada para consolidada.
    camada = "consolidada";
  }

  if (camada === "consolidada") {
    const seen = new Set<string>();
    const clean: PlanoSubtarefa[] = [];
    for (const raw of plano.subtarefas) {
      const s = cleanSubtarefa(raw);
      if (!s) continue;
      const key = s.titulo.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      clean.push(s);
      if (clean.length >= MAX_SUGGESTED_TAREFAS) break;
    }
    if (clean.length > 0) {
      const startOrdem = await nextTopLevelOrdem(tx, acaoId);
      await tx.insert(acaoTarefasTable).values(
        clean.map((s, i) => ({
          acaoId,
          parentTarefaId: null,
          titulo: s.titulo,
          status: "a_fazer" as const,
          ordem: startOrdem + i,
          respostaOrigemId: s.respostaOrigemId,
          origemPergunta: s.origemPergunta,
          origemResposta: s.origemResposta,
        })),
      );
      return;
    }
    // Sem subtarefas → degrada para pontual.
  }

  await createSuggestedTarefas(tx, acaoId, plano.tarefasSugeridas);
}
