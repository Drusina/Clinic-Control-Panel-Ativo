export interface DelegacaoLite {
  id: string;
  nivel: number;
  parentId?: string | null;
  status?: string | null;
  responsavelNome?: string | null;
  responsavelEmail?: string | null;
  pilarSlug: string;
  questaoInicio?: number | null;
  questaoFim?: number | null;
  perguntaIds?: string[] | null;
}

export interface PerguntaLite {
  id: string;
  pilarSlug: string;
  ordem: number;
}

/**
 * Resolve the current owner of a question by walking the delegation chain and
 * returning the deepest leaf delegation that covers the question.
 *
 * Coverage rules per nivel:
 *   - 1 → matches by pilarSlug only
 *   - 2 → matches by pilarSlug + ordem in [questaoInicio, questaoFim]
 *   - 3 → matches when perguntaIds includes the question id
 *
 * "Deepest leaf" = highest nivel; ties broken by absence of an active child
 * (i.e. a delegacao with no further child covering this question wins).
 */
export function resolveQuestionOwner(
  pergunta: PerguntaLite,
  delegacoes: DelegacaoLite[],
): DelegacaoLite | null {
  // Cobertura é definida pelo TIPO de escopo, não pelo nivel — assim cadeias
  // arbitrariamente profundas (4, 5, …) continuam funcionando.
  const covers = (d: DelegacaoLite): boolean => {
    if (d.status === "cancelada") return false;
    // 1) Escopo question-set (delegações ad-hoc, qualquer nivel >= 3 / sub-delegações)
    if (Array.isArray(d.perguntaIds) && d.perguntaIds.length > 0) {
      return d.perguntaIds.includes(pergunta.id);
    }
    // 2) Escopo por faixa contígua (N2)
    if (d.questaoInicio != null || d.questaoFim != null) {
      if (d.pilarSlug !== "misto" && d.pilarSlug !== pergunta.pilarSlug) return false;
      const ini = d.questaoInicio ?? Number.NEGATIVE_INFINITY;
      const fim = d.questaoFim ?? Number.POSITIVE_INFINITY;
      return pergunta.ordem >= ini && pergunta.ordem <= fim;
    }
    // 3) Escopo por pilar inteiro (N1)
    if (d.nivel === 1) {
      return d.pilarSlug === pergunta.pilarSlug;
    }
    return false;
  };

  const candidates = delegacoes.filter(covers);
  if (candidates.length === 0) return null;

  // Prefer leaves: a candidate whose id is NOT a parent of another candidate.
  const parentIds = new Set(candidates.map((d) => d.parentId).filter(Boolean) as string[]);
  const leaves = candidates.filter((d) => !parentIds.has(d.id));
  const pool = leaves.length > 0 ? leaves : candidates;
  // Tiebreak by deepest nivel.
  pool.sort((a, b) => b.nivel - a.nivel);
  return pool[0];
}
