import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db, diagnosticsTable, perguntasTable, respostasTable } from "@workspace/db";
import type { PerguntaFonte } from "@workspace/db";
import { calcAnswerValue } from "./score-calculator";
import { sanitizeTarefaTitles } from "./tarefas.js";
import { logger } from "./logger.js";

/**
 * Per-pillar AI call settings. Generation is split per pillar (small outputs),
 * streamed, and run with bounded concurrency, so a per-attempt timeout with a
 * single retry surfaces real failures quickly without the old ~2-min wait (the
 * previous single all-pillars call routinely exceeded its 45s timeout → 502).
 * RISK_AI_TOTAL_DEADLINE_MS is a hard wall-clock cap on the whole generation: a
 * shared AbortSignal aborts every in-flight/pending call so a degraded provider
 * can never push the total wait past this bound (it stays under the old ~137s).
 */
const RISK_AI_TIMEOUT_MS = 60_000;
const RISK_AI_MAX_RETRIES = 1;
const RISK_PILAR_CONCURRENCY = 4;
const RISK_AI_TOTAL_DEADLINE_MS = 100_000;

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
  /** Live diagnostic-answer id, carried so generated tarefas can link back to it. */
  respostaId: string;
  perguntaId: string;
};

/** A camada (generation layer) derived from how the pillar scored in the diagnostic. */
export type Camada = "pontual" | "consolidada" | "estrutural";

/**
 * A subtask carrying the diagnostic answer that originated it. `respostaOrigemId`
 * is a LIVE reference (may be re-validated/nulled at commit); the textual snapshot
 * (`origemPergunta`/`origemResposta`) is durable and survives a new diagnostic.
 */
export type GeneratedSubtarefa = {
  titulo: string;
  respostaOrigemId: string | null;
  origemPergunta: string | null;
  origemResposta: string | null;
};

/** A sequenced phase (estrutural layer) grouping origin-bearing subtasks. */
export type GeneratedFase = {
  titulo: string;
  descricao: string | null;
  subtarefas: GeneratedSubtarefa[];
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
  /** Títulos de tarefas de execução sugeridas pela IA (somente títulos). */
  tarefasSugeridas: string[];
  /** Material da camada consolidada: tarefas planas com rastreabilidade. */
  subtarefas: GeneratedSubtarefa[];
  /** Material da camada estrutural: fases encadeadas com subtarefas. */
  fases: GeneratedFase[];
};

export function severidadeToNivel(sev: number): "baixo" | "medio" | "alto" {
  if (sev <= 6) return "baixo";
  if (sev <= 14) return "medio";
  return "alto";
}

/**
 * Deriva a camada de geração a partir do score do pilar (0–5) no diagnóstico:
 * - > 3.5  → "pontual"     (pilar forte; apenas ajustes finos)
 * - 2.5–3.5 → "consolidada" (pilar mediano; tarefas com rastreabilidade)
 * - < 2.5  → "estrutural"  (pilar frágil; projeto faseado e encadeado)
 *
 * Sem score conhecido cai em "consolidada" (camada-padrão segura). Esta é a
 * ÚNICA fonte da camada — nunca confiar na IA nem no cliente.
 */
export function camadaForScore(score: number | null | undefined): Camada {
  if (score == null || !Number.isFinite(score)) return "consolidada";
  if (score > 3.5) return "pontual";
  if (score >= 2.5) return "consolidada";
  return "estrutural";
}

const ESCALA_LABELS: Record<string, string> = {
  "1": "Crítico",
  "2": "Ruim",
  "3": "Médio",
  "4": "Bom",
  "5": "Ótimo",
};

function humanizeResposta(valor: string, tipo: string): string {
  if (tipo === "sim_nao") return valor === "sim" ? "Sim" : "Não";
  if (tipo === "escala_1_5") {
    const label = ESCALA_LABELS[valor.trim()];
    return label ? `${valor.trim()} — ${label}` : valor;
  }
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
      respostaId: r.id,
      perguntaId: p.id,
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
  tarefasSugeridas?: unknown;
  subtarefas?: unknown;
  fases?: unknown;
};

const MAX_TITULO_LEN = 200;
const MAX_SUBTAREFAS = 12;
const MAX_FASES = 6;

function clampScore(n: unknown): number {
  const v = Math.round(Number(n));
  if (isNaN(v)) return 3;
  return Math.min(5, Math.max(1, v));
}

function cleanTitulo(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_TITULO_LEN);
}

/** Resolve one raw AI subtask ({titulo, perguntaIndice}) into an origin-bearing subtask. */
function resolveSubtarefa(
  raw: unknown,
  weakByIndex: Map<number, WeakAnswer>,
): GeneratedSubtarefa | null {
  const o = (raw ?? {}) as { titulo?: unknown; perguntaIndice?: unknown };
  const titulo = cleanTitulo(o.titulo);
  if (!titulo) return null;
  const w = weakByIndex.get(Number(o.perguntaIndice));
  return {
    titulo,
    respostaOrigemId: w ? w.respostaId : null,
    origemPergunta: w ? w.pergunta : null,
    origemResposta: w ? w.resposta : null,
  };
}

/**
 * Deterministic scaffold so the estrutural layer always has phases even when the
 * AI omits/garbles `fases`. Source-bearing subtasks land in the implementation
 * phase; the bookend phases are empty placeholders the consultant fills in.
 */
function fallbackFases(subtarefas: GeneratedSubtarefa[], pilarNome: string): GeneratedFase[] {
  return [
    {
      titulo: "Fase 1 — Diagnóstico e priorização",
      descricao: `Mapear e priorizar as lacunas estruturais do pilar ${pilarNome}.`,
      subtarefas: [],
    },
    {
      titulo: "Fase 2 — Implementação",
      descricao: "Executar as correções estruturais priorizadas.",
      subtarefas: subtarefas.slice(0, MAX_SUBTAREFAS),
    },
    {
      titulo: "Fase 3 — Consolidação e acompanhamento",
      descricao: "Padronizar os novos processos e monitorar os resultados.",
      subtarefas: [],
    },
  ];
}

/**
 * Synthesise thematic risks from the weak answers, mapping each risk back to its
 * source questions for traceability. Generation is split PER PILLAR — one streamed
 * Anthropic call per pillar (each ≤3 risks), run with bounded concurrency. Smaller
 * per-pillar payloads finish well within the timeout (the previous single
 * all-pillars call routinely exceeded it → "Request timed out" / 502), and a slow
 * or failing pillar no longer takes down the whole generation.
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
    if (!VALID_PILARES.has(w.pilarSlug)) continue;
    if (!byPilar.has(w.pilarSlug)) byPilar.set(w.pilarSlug, []);
    byPilar.get(w.pilarSlug)!.push(w);
  }

  const client = new Anthropic({ apiKey });
  const pilares = [...byPilar.entries()];
  const settled: GeneratedRisk[][] = pilares.map(() => []);
  const errors: unknown[] = [];

  // Hard wall-clock cap on the whole generation: one shared AbortSignal aborts
  // every in-flight and not-yet-started call once the deadline fires, so a
  // degraded provider can never push the total wait past RISK_AI_TOTAL_DEADLINE_MS.
  const ac = new AbortController();
  const deadline = setTimeout(() => ac.abort(), RISK_AI_TOTAL_DEADLINE_MS);

  // Bounded concurrency: process the pillars in parallel, but never more than
  // RISK_PILAR_CONCURRENCY simultaneous Anthropic calls (keeps us under rate limits).
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= pilares.length) break;
      const [slug, answers] = pilares[i];
      try {
        settled[i] = await generateRisksForPilar(client, slug, answers, ac.signal);
      } catch (err) {
        errors.push(err);
        logger.warn({ err, pilarSlug: slug }, "risk generation failed for pilar");
      }
    }
  }
  try {
    await Promise.all(
      Array.from({ length: Math.min(RISK_PILAR_CONCURRENCY, pilares.length) }, () => worker()),
    );
  } finally {
    clearTimeout(deadline);
  }

  const result = settled.flat();

  // Surface a failure only when nothing came back AND at least one pillar errored,
  // so the user is told to retry instead of seeing a misleading "no risks" message.
  // If some pillars succeeded, we return their risks (partial resilience).
  if (result.length === 0 && errors.length > 0) {
    const first = errors[0];
    throw new Error(first instanceof Error ? first.message : "Falha na geração de riscos");
  }

  return result;
}

/** Build the per-pillar prompt: same JSON contract as before, scoped to one pillar. */
function buildPilarPrompt(slug: string, answers: WeakAnswer[]): string {
  const pilarNome = PILAR_NOMES[slug] ?? slug;
  const listFormatted = answers
    .map((a) => `  [${a.index}] ${a.pergunta} → resposta: ${a.resposta}`)
    .join("\n");
  // Use this pillar's own (possibly non-contiguous) indices in the examples so the
  // model doesn't copy literal placeholders that aren't in this pillar's list.
  const exA = answers[0].index;
  const exB = answers[1]?.index ?? exA;
  const exampleIndices = JSON.stringify(exB === exA ? [exA] : [exA, exB]);

  return `Você é um consultor especialista em gestão de riscos de clínicas de saúde da metodologia IONEX360. Abaixo estão os pontos fracos identificados no diagnóstico 360° de uma clínica, todos do pilar ${slug} (${pilarNome}). Cada item tem um índice entre colchetes.

PONTOS FRACOS DO PILAR ${slug} (${pilarNome}):
${listFormatted}

Sua tarefa: agrupar os pontos fracos relacionados em RISCOS TEMÁTICOS profissionais. Para cada risco, escreva nome, descrição, probabilidade e impacto (escala 1-5 cada), ações mitigadoras, e liste os índices das perguntas que originaram aquele risco. Para cada risco gere TRÊS materiais de plano (a camada final é escolhida pelo sistema): tarefas simples, subtarefas rastreáveis e fases de projeto.

Responda EXCLUSIVAMENTE com um JSON válido neste formato (sem markdown, sem texto extra):
{
  "riscos": [
    {
      "pilarSlug": "${slug}",
      "nome": "Nome temático do risco (ex.: Fragilidade no controle de fluxo de caixa)",
      "descricao": "Descrição clara do risco e suas consequências para a clínica em 2-3 frases",
      "probabilidade": 4,
      "impacto": 5,
      "acoesMitigadoras": "Ações concretas para mitigar o risco em 1-2 frases",
      "perguntaIndices": ${exampleIndices},
      "tarefasSugeridas": ["Tarefa concreta 1", "Tarefa concreta 2", "Tarefa concreta 3"],
      "subtarefas": [
        { "titulo": "Subtarefa acionável", "perguntaIndice": ${exA} }
      ],
      "fases": [
        {
          "titulo": "Fase 1 — Diagnóstico e priorização",
          "descricao": "O que esta fase entrega",
          "subtarefas": [ { "titulo": "Passo concreto da fase", "perguntaIndice": ${exB} } ]
        }
      ]
    }
  ]
}

Regras:
- Crie no máximo 3 riscos; agrupe pontos fracos relacionados em um mesmo risco.
- pilarSlug deve ser exatamente "${slug}".
- perguntaIndices deve conter apenas índices que aparecem na lista acima, e cada risco deve referenciar pelo menos um índice.
- probabilidade e impacto são inteiros de 1 a 5. Quanto mais pontos fracos e mais graves, maiores os valores.
- tarefasSugeridas: 3 a 5 tarefas curtas e acionáveis (apenas o título, no infinitivo, ex.: "Implantar planilha de fluxo de caixa"). Sem responsável, datas ou prazos.
- subtarefas: liste tarefas acionáveis e, para cada uma, "perguntaIndice" = o índice do ponto fraco que a originou (use apenas índices da lista acima). Estas são tarefas rastreáveis até o diagnóstico.
- fases: estruture o trabalho em 2 a 5 fases SEQUENCIAIS (a fase seguinte depende da anterior). Cada fase tem titulo, descricao curta e suas subtarefas, cada subtarefa com "perguntaIndice" da lista acima quando aplicável.
- Escreva em português do Brasil, linguagem de negócio clara para um gestor não-técnico.`;
}

/**
 * Generate the risks for a single pillar via a STREAMING Anthropic call. Streaming
 * keeps the connection active so the SDK does not abort the generation mid-flight,
 * and the smaller per-pillar payload finishes well within the timeout. Throws on
 * transport/parse failure so the caller can record it as a per-pillar error.
 */
async function generateRisksForPilar(
  client: Anthropic,
  slug: string,
  answers: WeakAnswer[],
  signal?: AbortSignal,
): Promise<GeneratedRisk[]> {
  const prompt = buildPilarPrompt(slug, answers);

  const stream = client.messages.stream(
    {
      model: "claude-opus-4-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    },
    { timeout: RISK_AI_TIMEOUT_MS, maxRetries: RISK_AI_MAX_RETRIES, signal },
  );
  // finalText() concatenates every text block, robust to multi-block responses.
  const text = await stream.finalText();

  const jsonText = text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return parseGeneratedRisks(jsonText, answers, slug);
}

/**
 * Parse one pillar's AI JSON into GeneratedRisk[]. `forcedSlug` is the pillar we
 * asked about; every risk is pinned to it (all answers belong to that pillar) so
 * the AI cannot misattribute a risk to a different pillar.
 */
function parseGeneratedRisks(
  jsonText: string,
  weakForPilar: WeakAnswer[],
  forcedSlug: string,
): GeneratedRisk[] {
  let parsed: { riscos?: unknown };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Failed to parse AI response as JSON");
  }

  if (!Array.isArray(parsed.riscos)) {
    throw new Error("AI response missing required array: riscos");
  }

  const weakByIndex = new Map(weakForPilar.map((w) => [w.index, w]));
  const pilarSlug = forcedSlug;
  const pilarNome = PILAR_NOMES[pilarSlug] ?? pilarSlug;

  const result: GeneratedRisk[] = [];
  for (const raw of parsed.riscos as RawRisk[]) {
    const nome = String(raw.nome ?? "").trim();
    if (!nome) continue;

    const indices = Array.isArray(raw.perguntaIndices) ? raw.perguntaIndices : [];
    const perguntasFonte: PerguntaFonte[] = [];
    for (const idx of indices) {
      const w = weakByIndex.get(Number(idx));
      if (w) {
        perguntasFonte.push({
          pergunta: w.pergunta,
          resposta: w.resposta,
          pilarSlug: w.pilarSlug,
          respostaId: w.respostaId,
          perguntaId: w.perguntaId,
        });
      }
    }
    if (perguntasFonte.length === 0) continue;

    const probabilidade = clampScore(raw.probabilidade);
    const impacto = clampScore(raw.impacto);
    const severidade = probabilidade * impacto;

    // Camada consolidada (subtarefas planas rastreáveis). Fallback determinístico:
    // se a IA não devolver subtarefas válidas, deriva uma por ponto-fonte.
    let subtarefas: GeneratedSubtarefa[] = (Array.isArray(raw.subtarefas) ? raw.subtarefas : [])
      .map((s) => resolveSubtarefa(s, weakByIndex))
      .filter((s): s is GeneratedSubtarefa => s !== null)
      .slice(0, MAX_SUBTAREFAS);
    if (subtarefas.length === 0) {
      subtarefas = perguntasFonte.slice(0, MAX_SUBTAREFAS).map((pf) => ({
        titulo: cleanTitulo(`Tratar: ${pf.pergunta}`),
        respostaOrigemId: pf.respostaId ?? null,
        origemPergunta: pf.pergunta,
        origemResposta: pf.resposta,
      }));
    }

    // Camada estrutural (fases sequenciais encadeadas + subtarefas).
    let fases: GeneratedFase[] = (Array.isArray(raw.fases) ? raw.fases : [])
      .map((f) => {
        const o = (f ?? {}) as { titulo?: unknown; descricao?: unknown; subtarefas?: unknown };
        const fTitulo = cleanTitulo(o.titulo);
        if (!fTitulo) return null;
        const fSub = (Array.isArray(o.subtarefas) ? o.subtarefas : [])
          .map((s) => resolveSubtarefa(s, weakByIndex))
          .filter((s): s is GeneratedSubtarefa => s !== null)
          .slice(0, MAX_SUBTAREFAS);
        const descricao = String(o.descricao ?? "").trim();
        return { titulo: fTitulo, descricao: descricao || null, subtarefas: fSub };
      })
      .filter((f): f is GeneratedFase => f !== null)
      .slice(0, MAX_FASES);
    if (fases.length === 0) {
      fases = fallbackFases(subtarefas, pilarNome);
    }

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
      // Parse leniente: tarefas inválidas/ausentes viram [] e nunca rejeitam o risco.
      tarefasSugeridas: sanitizeTarefaTitles(raw.tarefasSugeridas),
      subtarefas,
      fases,
    });
  }

  return result;
}
