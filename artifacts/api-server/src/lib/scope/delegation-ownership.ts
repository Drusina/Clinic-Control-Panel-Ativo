import { eq, inArray } from "drizzle-orm";
import {
  db,
  delegacoesTable,
  delegacoesPerguntasTable,
  perguntasTable,
} from "@workspace/db";

/**
 * Backend "deepest-leaf owner" resolver para o sistema de delegação por pergunta
 * (cadeia indefinida — task #211).
 *
 * Dado o escopo declarado de uma delegação (perguntaIds explícitos para N3+ ou
 * o pilar inteiro para N1), retorna o subconjunto de perguntas que ainda
 * pertencem a esse responsável — ou seja, MENOS as perguntas que ele já
 * sub-delegou para frente. Como sub-delegações descendentes voltam a ser
 * filtradas pela mesma regra recursivamente em cada nó da cadeia, isso
 * implementa a semântica de "deepest leaf" sem assumir nivel fixo.
 *
 * Compartilhado entre /respondent/* (escopo do respondente) e qualquer caminho
 * administrativo que precise resolver a propriedade efetiva de uma pergunta
 * dentro de uma cadeia de delegações.
 */
export async function resolveOwnedPerguntaIds(args: {
  delegacaoId: string;
  /** perguntaIds explícitos do claim (delegações ad-hoc, qualquer nivel >= 3). */
  explicitPerguntaIds?: string[] | null;
  /** Slug do pilar — usado quando NÃO há perguntaIds explícitos (escopo N1). */
  pilarSlug: string;
}): Promise<Set<string>> {
  let base: string[];
  if (args.explicitPerguntaIds && args.explicitPerguntaIds.length > 0) {
    base = args.explicitPerguntaIds;
  } else {
    const rows = await db
      .select({ id: perguntasTable.id })
      .from(perguntasTable)
      .where(eq(perguntasTable.pilarSlug, args.pilarSlug));
    base = rows.map((p) => p.id);
  }
  const childDelegs = await db
    .select({ id: delegacoesTable.id })
    .from(delegacoesTable)
    .where(eq(delegacoesTable.parentId, args.delegacaoId));
  if (childDelegs.length === 0) return new Set(base);
  const childIds = childDelegs.map((d) => d.id);
  const child = await db
    .select({ perguntaId: delegacoesPerguntasTable.perguntaId })
    .from(delegacoesPerguntasTable)
    .where(inArray(delegacoesPerguntasTable.delegacaoId, childIds));
  const excluded = new Set(child.map((c) => c.perguntaId));
  return new Set(base.filter((id) => !excluded.has(id)));
}
