import Anthropic from "@anthropic-ai/sdk";
import { sanitizeTarefaTitles } from "./tarefas.js";
import { ICS_ACTIONS } from "./ics-seed.js";
import { PILAR_NOMES } from "./risk-generator.js";
import { logger } from "./logger.js";

/** Hard timeout for the manual-action suggestion AI call (shorter than risk gen). */
const TAREFA_AI_TIMEOUT_MS = 20_000;

export type SuggestSource = "ai" | "fallback";

export interface SuggestTarefasInput {
  titulo: string;
  descricao?: string | null;
  pilarSlug?: string | null;
}

export interface SuggestTarefasResult {
  tarefas: string[];
  source: SuggestSource;
}

/** Generic, always-valid task titles used when nothing better is available. */
const GENERIC_FALLBACK: string[] = [
  "Definir o objetivo e o escopo da ação",
  "Levantar a situação atual e os recursos necessários",
  "Elaborar o plano de execução em etapas",
  "Executar as etapas planejadas",
  "Acompanhar os resultados e ajustar o que for necessário",
];

/**
 * Curated fallback: try to reuse the ICS model tarefas for the closest action
 * (match by titulo + pilarSlug, case-insensitive titulo), else fall back to a
 * generic checklist. Always returns a sanitized, non-empty list.
 */
function curatedFallback(input: SuggestTarefasInput): string[] {
  const titulo = input.titulo.trim().toLowerCase();
  const pilar = input.pilarSlug ?? null;

  const exact = ICS_ACTIONS.find(
    (a) =>
      a.titulo.trim().toLowerCase() === titulo &&
      (pilar == null || a.pilarSlug === pilar) &&
      a.tarefas &&
      a.tarefas.length > 0,
  );
  if (exact?.tarefas) return sanitizeTarefaTitles(exact.tarefas);

  if (pilar) {
    const samePilar = ICS_ACTIONS.find(
      (a) => a.pilarSlug === pilar && a.tarefas && a.tarefas.length > 0,
    );
    if (samePilar?.tarefas) return sanitizeTarefaTitles(samePilar.tarefas);
  }

  return sanitizeTarefaTitles(GENERIC_FALLBACK);
}

/**
 * Suggest execution-task titles for a single action plan card. Uses the AI when
 * available, with a hard timeout and lenient parsing; on ANY failure (no key,
 * timeout, bad JSON, empty result) it returns a curated fallback so the caller
 * never blocks. The result carries only task TITLES — never responsável, dates,
 * or status.
 */
export async function suggestTarefasForAction(
  input: SuggestTarefasInput,
): Promise<SuggestTarefasResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { tarefas: curatedFallback(input), source: "fallback" };
  }

  try {
    const pilarNome = input.pilarSlug ? (PILAR_NOMES[input.pilarSlug] ?? input.pilarSlug) : null;
    const contexto = [
      `Título da ação: ${input.titulo.trim()}`,
      input.descricao?.trim() ? `Descrição: ${input.descricao.trim()}` : null,
      pilarNome ? `Pilar: ${pilarNome}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `Você é um consultor especialista em gestão de clínicas de saúde da metodologia IONEX360. A clínica criou a seguinte ação no plano de ação:

${contexto}

Sua tarefa: sugerir de 3 a 6 tarefas de execução curtas e acionáveis para concluir essa ação.

Responda EXCLUSIVAMENTE com um JSON válido neste formato (sem markdown, sem texto extra):
{
  "tarefas": ["Tarefa concreta 1", "Tarefa concreta 2", "Tarefa concreta 3"]
}

Regras:
- Cada tarefa é apenas o TÍTULO no infinitivo (ex.: "Levantar os contratos vigentes"). NÃO inclua responsável, datas, prazos nem status.
- Tarefas concretas e na ordem lógica de execução.
- Escreva em português do Brasil, linguagem clara para um gestor não-técnico.`;

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create(
      {
        model: "claude-opus-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      },
      { timeout: TAREFA_AI_TIMEOUT_MS },
    );

    const content = message.content[0];
    if (!content || content.type !== "text") {
      return { tarefas: curatedFallback(input), source: "fallback" };
    }

    // Lenient parse: tolerate markdown fences / stray text around the JSON.
    const text = content.text.trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const json = start >= 0 && end > start ? text.slice(start, end + 1) : text;
    const parsed = JSON.parse(json) as { tarefas?: unknown };
    const tarefas = sanitizeTarefaTitles(parsed.tarefas);

    if (tarefas.length === 0) {
      return { tarefas: curatedFallback(input), source: "fallback" };
    }
    return { tarefas, source: "ai" };
  } catch (err) {
    logger.warn({ err, titulo: input.titulo }, "suggestTarefasForAction falling back");
    return { tarefas: curatedFallback(input), source: "fallback" };
  }
}
