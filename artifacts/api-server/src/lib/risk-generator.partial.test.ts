import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WeakAnswer } from "./risk-generator.js";

// Mock the Anthropic SDK so the per-pillar streaming calls never hit the network.
// Each call resolves/rejects based on the pillar named in the prompt, letting us
// exercise the partial-failure resilience of generateRisksFromWeakAnswers().
const { streamMock } = vi.hoisted(() => ({ streamMock: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: streamMock };
  },
}));

const { generateRisksFromWeakAnswers } = await import("./risk-generator.js");

const FIN: WeakAnswer = {
  index: 0,
  pilarSlug: "financeiro",
  pilarNome: "Financeiro e Fluxo de Caixa",
  pergunta: "Você controla o fluxo de caixa diariamente?",
  resposta: "Não",
  valor: 1,
  respostaId: "resp-fin-0",
  perguntaId: "perg-fin-0",
};
const MKT: WeakAnswer = {
  index: 1,
  pilarSlug: "marketing",
  pilarNome: "Vendas, Marketing e Captação de Pacientes",
  pergunta: "Você faz captação ativa de pacientes?",
  resposta: "Não",
  valor: 1,
  respostaId: "resp-mkt-1",
  perguntaId: "perg-mkt-1",
};

function riscoJson(slug: string, idx: number): string {
  return JSON.stringify({
    riscos: [
      {
        pilarSlug: slug,
        nome: `Risco temático de ${slug}`,
        descricao: "Descrição do risco.",
        probabilidade: 4,
        impacto: 5,
        acoesMitigadoras: "Ações mitigadoras.",
        perguntaIndices: [idx],
        tarefasSugeridas: ["Tarefa concreta"],
        subtarefas: [],
        fases: [],
      },
    ],
  });
}

/** Map a per-pillar prompt to its slug so the mock can branch on it. */
function slugFromPrompt(body: unknown): string {
  const content = String((body as { messages: { content: unknown }[] }).messages[0].content);
  if (content.includes("PILAR financeiro")) return "financeiro";
  if (content.includes("PILAR marketing")) return "marketing";
  return "desconhecido";
}

describe("generateRisksFromWeakAnswers — partial failure resilience", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    streamMock.mockReset();
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("returns only the successful pillar's risks when another pillar fails", async () => {
    streamMock.mockImplementation((body: unknown) => {
      const slug = slugFromPrompt(body);
      if (slug === "financeiro") {
        return { finalText: () => Promise.resolve(riscoJson("financeiro", 0)) };
      }
      return { finalText: () => Promise.reject(new Error("Anthropic stream boom")) };
    });

    const risks = await generateRisksFromWeakAnswers([FIN, MKT]);

    expect(risks).toHaveLength(1);
    expect(risks[0].pilarSlug).toBe("financeiro");
    expect(risks[0].perguntasFonte[0].perguntaId).toBe("perg-fin-0");
  });

  it("throws when every pillar fails", async () => {
    streamMock.mockImplementation(() => ({
      finalText: () => Promise.reject(new Error("provider down")),
    }));

    await expect(generateRisksFromWeakAnswers([FIN, MKT])).rejects.toThrow("provider down");
  });

  it("returns risks from all pillars when every call succeeds", async () => {
    streamMock.mockImplementation((body: unknown) => {
      const slug = slugFromPrompt(body);
      const idx = slug === "financeiro" ? 0 : 1;
      return { finalText: () => Promise.resolve(riscoJson(slug, idx)) };
    });

    const risks = await generateRisksFromWeakAnswers([FIN, MKT]);

    expect(risks).toHaveLength(2);
    expect(new Set(risks.map((r) => r.pilarSlug))).toEqual(new Set(["financeiro", "marketing"]));
  });

  it("returns [] without throwing when pillars succeed but synthesise no risks", async () => {
    streamMock.mockImplementation(() => ({
      finalText: () => Promise.resolve(JSON.stringify({ riscos: [] })),
    }));

    const risks = await generateRisksFromWeakAnswers([FIN, MKT]);

    expect(risks).toEqual([]);
  });
});
