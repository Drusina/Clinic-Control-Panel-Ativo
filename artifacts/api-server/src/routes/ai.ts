import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db, diagnosticsTable, perguntasTable, respostasTable } from "@workspace/db";
import { recalculateScores } from "../lib/score-calculator";

const router: IRouter = Router();

const PILAR_NOMES: Record<string, string> = {
  estrategia: "Estratégia e Governança",
  financeiro: "Financeiro e Fluxo de Caixa",
  contabil: "Contabilidade e Fiscal",
  marketing: "Vendas, Marketing e Captação de Pacientes",
  operacoes: "Processos Operacionais e Atendimento",
  pessoas: "Gestão de Pessoas e Cultura",
  tecnologia: "Tecnologia e Sistemas",
  compliance: "Conformidade, Regulamentação e LGPD",
};

router.post("/ai/analyze-diagnostico", async (req, res): Promise<void> => {
  const { diagnosticoId, scores: directScores, respostas_criticas: directCriticas } = req.body;

  if (!diagnosticoId && !directScores) {
    res.status(400).json({ error: "Provide either diagnosticoId (DB lookup mode) or scores+respostas_criticas (direct mode)" });
    return;
  }

  if (diagnosticoId && directScores) {
    res.status(400).json({ error: "Provide diagnosticoId or scores+respostas_criticas, not both" });
    return;
  }

  let scores: Record<string, number> = {};
  let respostasCriticas: Array<{ pilar: string; pergunta: string; resposta: string }> = [];

  if (directScores) {
    scores = directScores as Record<string, number>;
    respostasCriticas = (directCriticas ?? []) as typeof respostasCriticas;
  } else {
    const [diagnostic] = await db
      .select()
      .from(diagnosticsTable)
      .where(eq(diagnosticsTable.id, diagnosticoId));

    if (!diagnostic) {
      res.status(404).json({ error: "Diagnostic not found" });
      return;
    }

    scores = (diagnostic.scoresPilares as Record<string, number>) || {};

    const respostas = await db
      .select({ valor: respostasTable.valor, perguntaId: respostasTable.perguntaId })
      .from(respostasTable)
      .where(eq(respostasTable.diagnosticoId, diagnosticoId));

    const allPerguntas = await db.select().from(perguntasTable);
    const perguntaMap = new Map(allPerguntas.map((p) => [p.id, p]));

    respostasCriticas = respostas
      .filter((r) => {
        const p = perguntaMap.get(r.perguntaId);
        if (!p) return false;
        if (p.tipo === "sim_nao" && r.valor === "nao") return true;
        if (p.tipo === "escala_1_5" && Number(r.valor) <= 2) return true;
        return false;
      })
      .slice(0, 20)
      .map((r) => {
        const p = perguntaMap.get(r.perguntaId);
        return {
          pilar: p?.pilarNome ?? "Desconhecido",
          pergunta: p?.texto ?? "",
          resposta: r.valor,
        };
      });
  }

  const scoresFormatted = Object.entries(scores)
    .map(([slug, score]) => `- ${PILAR_NOMES[slug] ?? slug}: ${score.toFixed(1)}/5`)
    .join("\n");

  const criticasFormatted = respostasCriticas
    .map((r) => `- [${r.pilar}] ${r.pergunta} → ${r.resposta}`)
    .join("\n");

  const prompt = `Você é um consultor especialista em gestão de clínicas de saúde da metodologia IONEX360. Analise os resultados do diagnóstico 360° abaixo e forneça insights estratégicos estruturados.

SCORES POR PILAR (escala 1-5):
${scoresFormatted}

PONTOS CRÍTICOS IDENTIFICADOS:
${criticasFormatted || "Nenhum ponto crítico identificado."}

Responda EXCLUSIVAMENTE com um JSON válido no seguinte formato (sem markdown, sem texto extra):
{
  "pontos_fortes": [
    {"pilar": "slug_do_pilar", "titulo": "Título curto", "descricao": "Descrição de 1-2 frases sobre o ponto forte"}
  ],
  "pontos_criticos": [
    {"pilar": "slug_do_pilar", "titulo": "Título curto", "descricao": "Descrição de 1-2 frases sobre o problema", "impacto": "alto|medio|baixo"}
  ],
  "acoes_sugeridas": [
    {"pilar": "slug_do_pilar", "titulo": "Título da ação", "descricao": "Descrição detalhada da ação em 2-3 frases", "prioridade": "alta|media|baixa", "prazo": "curto|medio|longo"}
  ]
}

Regras:
- pontos_fortes: 2-4 itens, apenas pilares com score >= 3.5
- pontos_criticos: 3-6 itens, foque nos pilares com score < 3 e respostas críticas
- acoes_sugeridas: 5-8 itens concretos e acionáveis, ordenados por prioridade
- pilar deve ser um dos slugs: estrategia, financeiro, contabil, marketing, operacoes, pessoas, tecnologia, compliance`;

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
      return;
    }

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      res.status(500).json({ error: "Unexpected response type from AI" });
      return;
    }

    let insights: {
      pontos_fortes: Array<{ pilar: string; titulo: string; descricao: string }>;
      pontos_criticos: Array<{ pilar: string; titulo: string; descricao: string; impacto: string }>;
      acoes_sugeridas: Array<{ pilar: string; titulo: string; descricao: string; prioridade: string; prazo: string }>;
    };
    try {
      const jsonText = content.text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
      const parsed = JSON.parse(jsonText);

      if (
        !Array.isArray(parsed.pontos_fortes) ||
        !Array.isArray(parsed.pontos_criticos) ||
        !Array.isArray(parsed.acoes_sugeridas)
      ) {
        res.status(500).json({ error: "AI response missing required arrays: pontos_fortes, pontos_criticos, acoes_sugeridas" });
        return;
      }

      const VALID_PRIORITIES = new Set(["alta", "media", "baixa"]);
      const VALID_PRAZOS = new Set(["curto", "medio", "longo"]);
      const VALID_IMPACTOS = new Set(["alto", "medio", "baixo"]);

      const normalizeAcao = (a: Record<string, unknown>) => ({
        pilar: String(a.pilar ?? ""),
        titulo: String(a.titulo ?? ""),
        descricao: String(a.descricao ?? ""),
        prioridade: VALID_PRIORITIES.has(String(a.prioridade)) ? String(a.prioridade) : "media",
        prazo: VALID_PRAZOS.has(String(a.prazo)) ? String(a.prazo) : "medio",
      });

      insights = {
        pontos_fortes: (parsed.pontos_fortes as Record<string, unknown>[]).map((p) => ({
          pilar: String(p.pilar ?? ""),
          titulo: String(p.titulo ?? ""),
          descricao: String(p.descricao ?? ""),
        })),
        pontos_criticos: (parsed.pontos_criticos as Record<string, unknown>[]).map((p) => ({
          pilar: String(p.pilar ?? ""),
          titulo: String(p.titulo ?? ""),
          descricao: String(p.descricao ?? ""),
          impacto: VALID_IMPACTOS.has(String(p.impacto)) ? String(p.impacto) : "medio",
        })),
        acoes_sugeridas: (parsed.acoes_sugeridas as Record<string, unknown>[]).map(normalizeAcao),
      };
    } catch {
      res.status(500).json({ error: "Failed to parse AI response as JSON" });
      return;
    }

    if (diagnosticoId) {
      await db
        .update(diagnosticsTable)
        .set({ insightsIa: insights })
        .where(eq(diagnosticsTable.id, diagnosticoId));
    }

    res.json(insights);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `AI analysis failed: ${message}` });
  }
});

router.post("/diagnostics/:id/calculate-scores", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [diagnostic] = await db
    .select()
    .from(diagnosticsTable)
    .where(eq(diagnosticsTable.id, id));

  if (!diagnostic) {
    res.status(404).json({ error: "Diagnostic not found" });
    return;
  }

  await recalculateScores(id);

  const [updated] = await db
    .select()
    .from(diagnosticsTable)
    .where(eq(diagnosticsTable.id, id));

  res.json({
    id: updated.id,
    scores: updated.scoresPilares,
    scoreGlobal: updated.scoreGlobal != null ? Number(updated.scoreGlobal) : null,
    status: updated.status,
  });
});

export default router;
