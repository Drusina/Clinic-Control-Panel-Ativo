import { eq, inArray } from "drizzle-orm";
import { db, diagnosticsTable, perguntasTable, respostasTable } from "@workspace/db";

export const PILARES_DEFINIDOS = [
  "estrategia",
  "financeiro",
  "contabil",
  "marketing",
  "operacoes",
  "pessoas",
  "tecnologia",
  "compliance",
] as const;

export type PilarProgress = {
  slug: string;
  questionCount: number;
  answeredCount: number;
  completo: boolean;
};

export type DiagnosticProgress = {
  totalQuestions: number;
  totalAnswered: number;
  completo: boolean;
  pilares: PilarProgress[];
};

/**
 * Computes per-pillar and overall answer progress for one or more diagnostics
 * in a single pair of queries. The question bank is global (shared by every
 * diagnostic), so `totalQuestions`/per-pillar `questionCount` are identical
 * across diagnostics; only `answeredCount` varies.
 *
 * `completo` is true once every question in the bank has a response — this is
 * the same threshold `recalculateScores` uses to auto-flip a diagnostic to
 * "concluido", and the gate the `complete` endpoint enforces.
 */
export async function computeProgressForDiagnostics(
  diagnosticoIds: string[],
): Promise<Map<string, DiagnosticProgress>> {
  const result = new Map<string, DiagnosticProgress>();
  if (diagnosticoIds.length === 0) return result;

  const allPerguntas = await db
    .select({ id: perguntasTable.id, pilarSlug: perguntasTable.pilarSlug })
    .from(perguntasTable);

  const perguntaPilar = new Map(allPerguntas.map((p) => [p.id, p.pilarSlug]));
  const pilarQuestionCount = new Map<string, number>();
  for (const p of allPerguntas) {
    pilarQuestionCount.set(p.pilarSlug, (pilarQuestionCount.get(p.pilarSlug) ?? 0) + 1);
  }
  const totalQuestions = allPerguntas.length;

  const respostas = await db
    .select({
      diagnosticoId: respostasTable.diagnosticoId,
      perguntaId: respostasTable.perguntaId,
    })
    .from(respostasTable)
    .where(inArray(respostasTable.diagnosticoId, diagnosticoIds));

  // diagnosticId -> (pilarSlug -> answered count). Orphan respostas (whose
  // pergunta no longer exists) are ignored so counts can never exceed the bank.
  const answeredByDiag = new Map<string, Map<string, number>>();
  const totalAnsweredByDiag = new Map<string, number>();
  for (const r of respostas) {
    const pilar = perguntaPilar.get(r.perguntaId);
    if (!pilar) continue;
    let pilarMap = answeredByDiag.get(r.diagnosticoId);
    if (!pilarMap) {
      pilarMap = new Map();
      answeredByDiag.set(r.diagnosticoId, pilarMap);
    }
    pilarMap.set(pilar, (pilarMap.get(pilar) ?? 0) + 1);
    totalAnsweredByDiag.set(r.diagnosticoId, (totalAnsweredByDiag.get(r.diagnosticoId) ?? 0) + 1);
  }

  // Stable pillar order: the 8 defined pillars first (in canonical order),
  // then any extra pillars present in the bank.
  const definedSet = new Set<string>(PILARES_DEFINIDOS);
  const orderedPilars = [
    ...PILARES_DEFINIDOS.filter((s) => pilarQuestionCount.has(s)),
    ...[...pilarQuestionCount.keys()].filter((s) => !definedSet.has(s)),
  ];

  for (const diagId of diagnosticoIds) {
    const pilarMap = answeredByDiag.get(diagId) ?? new Map<string, number>();
    const pilares: PilarProgress[] = orderedPilars.map((slug) => {
      const questionCount = pilarQuestionCount.get(slug) ?? 0;
      const answeredCount = Math.min(pilarMap.get(slug) ?? 0, questionCount);
      return {
        slug,
        questionCount,
        answeredCount,
        completo: questionCount > 0 && answeredCount >= questionCount,
      };
    });
    const totalAnswered = Math.min(totalAnsweredByDiag.get(diagId) ?? 0, totalQuestions);
    result.set(diagId, {
      totalQuestions,
      totalAnswered,
      completo: totalQuestions > 0 && totalAnswered >= totalQuestions,
      pilares,
    });
  }

  return result;
}

export function calcAnswerValue(resposta: { valor: string }, pergunta: {
  tipo: string;
  valorMin: string | null;
  valorMax: string | null;
  inverso: boolean;
}): number | null {
  if (pergunta.tipo === "sim_nao") {
    return resposta.valor === "sim" ? 5 : 1;
  }

  if (pergunta.tipo === "escala_1_5") {
    const v = Number(resposta.valor);
    return isNaN(v) || v < 1 || v > 5 ? null : v;
  }

  if (pergunta.tipo === "numerico") {
    const raw = Number(resposta.valor);
    if (isNaN(raw)) return null;
    if (pergunta.valorMin == null || pergunta.valorMax == null) return null;
    const min = Number(pergunta.valorMin);
    const max = Number(pergunta.valorMax);
    const range = max - min;
    if (range === 0) return 3;
    const normalized = Math.min(1, Math.max(0, (raw - min) / range));
    return pergunta.inverso
      ? 1 + (1 - normalized) * 4
      : 1 + normalized * 4;
  }

  if (pergunta.tipo === "texto_livre") {
    return resposta.valor && resposta.valor.trim().length > 10 ? 4 : 2;
  }

  return null;
}

export async function recalculateScores(diagnosticoId: string): Promise<void> {
  const [respostas, allPerguntas] = await Promise.all([
    db.select().from(respostasTable).where(eq(respostasTable.diagnosticoId, diagnosticoId)),
    db.select().from(perguntasTable),
  ]);

  const perguntaMap = new Map(allPerguntas.map((p) => [p.id, p]));
  const respostaMap = new Map(respostas.map((r) => [r.perguntaId, r]));

  const pilarGroups: Record<string, typeof allPerguntas> = {};
  for (const p of allPerguntas) {
    if (!pilarGroups[p.pilarSlug]) pilarGroups[p.pilarSlug] = [];
    pilarGroups[p.pilarSlug].push(p);
  }

  const scores: Record<string, number> = {};

  for (const slug of PILARES_DEFINIDOS) {
    const pillarQuestions = pilarGroups[slug] ?? [];
    if (pillarQuestions.length === 0) continue;

    const allAnswered = pillarQuestions.every((p) => respostaMap.has(p.id));
    if (!allAnswered) continue;

    let weightedTotal = 0;
    let pesoTotal = 0;

    for (const pergunta of pillarQuestions) {
      const resposta = respostaMap.get(pergunta.id);
      if (!resposta) continue;

      const valor = calcAnswerValue(resposta, pergunta);
      if (valor === null) continue;

      const peso = Number(pergunta.peso);
      weightedTotal += valor * peso;
      pesoTotal += peso;
    }

    if (pesoTotal > 0) {
      scores[slug] = Math.round((weightedTotal / pesoTotal) * 10) / 10;
    }
  }

  const completedPilars = Object.keys(scores);
  const allPilarsComplete = PILARES_DEFINIDOS.every((s) => scores[s] !== undefined);

  const scoreGlobal = allPilarsComplete
    ? Math.round(
        (PILARES_DEFINIDOS.reduce((acc, s) => acc + scores[s], 0) / PILARES_DEFINIDOS.length) * 10
      ) / 10
    : null;

  const totalAnswered = respostas.length;
  const totalQuestions = allPerguntas.length;
  const newStatus = totalAnswered >= totalQuestions ? "concluido" : "em_andamento";

  await db
    .update(diagnosticsTable)
    .set({
      scoresPilares: completedPilars.length > 0 ? scores : null,
      scoreGlobal: scoreGlobal !== null ? scoreGlobal.toString() : null,
      status: newStatus,
      concluidoEm: newStatus === "concluido" ? new Date() : null,
    })
    .where(eq(diagnosticsTable.id, diagnosticoId));
}
