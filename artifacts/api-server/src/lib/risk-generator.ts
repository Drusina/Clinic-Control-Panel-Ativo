import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db, diagnosticsTable, perguntasTable, respostasTable } from "@workspace/db";
import type { PerguntaFonte } from "@workspace/db";
import { calcAnswerValue } from "./score-calculator";

export const PILAR_NOMES: Record<string, string> = {
  estrategia: "Estratégia e Governança",
  financeiro: "Financeiro e Fluxo de Caixa",
  contabil: "Contabilidade e Fiscal",
  marketing: "Vendas, Marketing e Captação de Pacientes",
  operacoes: "Processos Operacionais e Atendimento",
  pessoas: "Gestão de Pessoas e Cultura",
  tecnologia: "Tecnologia e Sistemas",
  compliance: "Conformidade, Regulamentação e LGPD",
};

const VALID_PILARES = new Set(Object.keys(PILAR_NOMES));

/** A weak answer collected from the diagnostic, with a stable index for AI referencing. */
export type WeakAnswer = {
  index: number;
  pilarSlug: string;
  pilarNome: string;
  pergunta: string;
  resposta: string;
  valor: number;
};

/** A risk synthesised by the AI from a group of weak answers. */
export type GeneratedRisk = {
  pilarSlug: string;
  nome: string;
  descricao: string;
  probabilidade: number;
  impacto: number;
  severidade: number;
  nivel: "baixo" | "medio" | "alto";
  acoesMitigadoras: string;
  perguntasFonte: PerguntaFonte[];
};

export function severidadeToNivel(sev: number): "baixo" | "medio" | "alto" {
  if (sev <= 6) return "baixo";
  if (sev <= 14) return "medio";
  return "alto";
}

function humanizeResposta(valor: string, tipo: string): string {
  if (tipo === "sim_nao") return valor === "sim" ? "Sim" : "Não";
  return valor;
}

/**
 * Collect the weak/critical answers of a diagnostic, reusing the same scoring
 * rule as the score calculator (an answer scoring <= 2 on the 1-5 scale is weak).
 */
export async function collectWeakAnswers(diagnosticoId: string): Promise<WeakAnswer[]> {
  const [respostas, allPerguntas] = await Promise.all([
    db.select().from(respostasTable).where(eq(respostasTable.diagnosticoId, diagnosticoId)),
    db.select().from(perguntasTable),
  ]);

  const perguntaMap = new Map(allPerguntas.map((p) => [p.id, p]));

  const weak: WeakAnswer[] = [];
  let index = 0;

  for (const r of respostas) {
    const p = perguntaMap.get(r.perguntaId);
    if (!p) continue;
    const valor = calcAnswerValue(r, p);
    if (valor === null || valor > 2) continue;

    weak.push({
      index: index++,
      pilarSlug: p.pilarSlug,
      pilarNome: p.pilarNome,
      pergunta: p.texto,
      resposta: humanizeResposta(r.valor, p.tipo),
      valor,
    });
  }

  return weak;
}

type RawRisk = {
  pilarSlug: string;
  nome: string;
  descricao: string;
  probabilidade: number;
  impacto: number;
  acoesMitigadoras: string;
  perguntaIndices: number[];
};

function clampScore(n: unknown): number {
  const v = Math.round(Number(n));
  if (isNaN(v)) return 3;
  return Math.min(5, Math.max(1, v));
}

/**
 * Ask the AI to synthesise thematic risks from the weak answers, grouped by pillar,
 * and map each risk back to its source questions for traceability.
 */
export async function generateRisksFromWeakAnswers(
  weak: WeakAnswer[],
): Promise<GeneratedRisk[]> {
  if (weak.length === 0) return [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const byPilar = new Map<string, WeakAnswer[]>();
  for (const w of weak) {
    if (!byPilar.has(w.pilarSlug)) byPilar.set(w.pilarSlug, []);
    byPilar.get(w.pilarSlug)!.push(w);
  }

  const listFormatted = [...byPilar.entries()]
    .map(([slug, answers]) => {
      const header = `PILAR ${slug} (${PILAR_NOMES[slug] ?? slug}):`;
      const lines = answers
        .map((a) => `  [${a.index}] ${a.pergunta} → resposta: ${a.resposta}`)
        .join("\n");
      return `${header}\n${lines}`;
    })
    .join("\n\n");

  const prompt = `Você é um consultor especialista em gestão de riscos de clínicas de saúde da metodologia IONEX360. Abaixo estão os pontos fracos identificados no diagnóstico 360° de uma clínica, agrupados por pilar. Cada item tem um índice entre colchetes.

PONTOS FRACOS POR PILAR:
${listFormatted}

Sua tarefa: agrupar os pontos fracos relacionados em RISCOS TEMÁTICOS profissionais. Para cada risco, escreva nome, descrição, probabilidade e impacto (escala 1-5 cada), ações mitigadoras, e liste os índices das perguntas que originaram aquele risco.

Responda EXCLUSIVAMENTE com um JSON válido neste formato (sem markdown, sem texto extra):
{
  "riscos": [
    {
      "pilarSlug": "slug_do_pilar",
      "nome": "Nome temático do risco (ex.: Fragilidade no controle de fluxo de caixa)",
      "descricao": "Descrição clara do risco e suas consequências para a clínica em 2-3 frases",
      "probabilidade": 4,
      "impacto": 5,
      "acoesMitigadoras": "Ações concretas para mitigar o risco em 1-2 frases",
      "perguntaIndices": [0, 3]
    }
  ]
}

Regras:
- Crie no máximo 3 riscos por pilar; agrupe pontos fracos relacionados em um mesmo risco.
- pilarSlug deve ser exatamente o slug indicado no pilar de origem das perguntas.
- perguntaIndices deve conter apenas índices que aparecem na lista acima, e cada risco deve referenciar pelo menos um índice.
- probabilidade e impacto são inteiros de 1 a 5. Quanto mais pontos fracos e mais graves, maiores os valores.
- Escreva em português do Brasil, linguagem de negócio clara para um gestor não-técnico.`;

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (!content || content.type !== "text") {
    throw new Error("Unexpected response type from AI");
  }

  const jsonText = content.text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  let parsed: { riscos?: unknown };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Failed to parse AI response as JSON");
  }

  if (!Array.isArray(parsed.riscos)) {
    throw new Error("AI response missing required array: riscos");
  }

  const weakByIndex = new Map(weak.map((w) => [w.index, w]));

  const result: GeneratedRisk[] = [];
  for (const raw of parsed.riscos as RawRisk[]) {
    const pilarSlug = String(raw.pilarSlug ?? "");
    if (!VALID_PILARES.has(pilarSlug)) continue;
    const nome = String(raw.nome ?? "").trim();
    if (!nome) continue;

    const indices = Array.isArray(raw.perguntaIndices) ? raw.perguntaIndices : [];
    const perguntasFonte: PerguntaFonte[] = [];
    for (const idx of indices) {
      const w = weakByIndex.get(Number(idx));
      if (w) {
        perguntasFonte.push({ pergunta: w.pergunta, resposta: w.resposta, pilarSlug: w.pilarSlug });
      }
    }
    if (perguntasFonte.length === 0) continue;

    const probabilidade = clampScore(raw.probabilidade);
    const impacto = clampScore(raw.impacto);
    const severidade = probabilidade * impacto;

    result.push({
      pilarSlug,
      nome,
      descricao: String(raw.descricao ?? "").trim(),
      probabilidade,
      impacto,
      severidade,
      nivel: severidadeToNivel(severidade),
      acoesMitigadoras: String(raw.acoesMitigadoras ?? "").trim(),
      perguntasFonte,
    });
  }

  return result;
}
