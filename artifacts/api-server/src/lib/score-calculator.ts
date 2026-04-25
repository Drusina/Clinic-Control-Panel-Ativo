import { eq } from "drizzle-orm";
import { db, diagnosticsTable, perguntasTable, respostasTable } from "@workspace/db";

const PILARES_DEFINIDOS = [
  "estrategia",
  "financeiro",
  "contabil",
  "marketing",
  "operacoes",
  "pessoas",
  "tecnologia",
  "compliance",
] as const;

function calcAnswerValue(resposta: { valor: string }, pergunta: {
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
