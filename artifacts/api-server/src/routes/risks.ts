import { Router, type IRouter } from "express";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import {
  db,
  risksTable,
  clinicsTable,
  diagnosticsTable,
  actionsTable,
  respostasTable,
} from "@workspace/db";
import { assertClinicAccess, type AuthenticatedRequest } from "../middleware/auth";
import {
  CreateRiskBody,
  UpdateRiskBody,
  UpdateRiskResponse,
  CommitRisksFromDiagnosticBody,
} from "@workspace/api-zod";
import { getTemplateForPlan } from "../lib/ics-seed.js";
import {
  collectWeakAnswers,
  generateRisksFromWeakAnswers,
  severidadeToNivel,
  camadaForScore,
} from "../lib/risk-generator.js";
import {
  sanitizeTarefaTitles,
  createPlanoTarefas,
  type PlanoSubtarefa,
  type PlanoFase,
} from "../lib/tarefas.js";
import { loadPilarScores } from "../lib/origem-diagnostico.js";
import { reconcileRiskStatus, severidadeToPrioridade } from "../lib/risk-lifecycle.js";
import type { PerguntaFonte } from "@workspace/db";

const router: IRouter = Router();

function mapRisk(r: typeof risksTable.$inferSelect, temCard = false) {
  return {
    id: r.id,
    clinicId: r.clinicId,
    nome: r.nome,
    descricao: r.descricao,
    probabilidade: r.probabilidade,
    impacto: r.impacto,
    severidade: r.severidade,
    pilarSlug: r.pilarSlug,
    responsavel: r.responsavel,
    acoesMitigadoras: r.acoesMitigadoras,
    status: r.status,
    statusJustificativa: r.statusJustificativa ?? null,
    origem: r.origem,
    nivel: r.nivel,
    diagnosticoId: r.diagnosticoId,
    perguntasFonte: r.perguntasFonte ?? null,
    // True when at least one Plano de Ação card is linked to this risk. Drives
    // the Aceitar/Descartar flow on the Mapa de Riscos: a risk with a card has
    // its status controlled by the board; a risk without one is still manual.
    temCard,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/clinics/:clinicId/risks", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const risks = await db
    .select()
    .from(risksTable)
    .where(eq(risksTable.clinicId, clinicId))
    .orderBy(risksTable.createdAt);

  // Resolve which risks have at least one linked Plano de Ação card in a single
  // query (distinct risco_origem_id for this clinic), then flag each risk.
  const linkedRows = await db
    .selectDistinct({ riscoOrigemId: actionsTable.riscoOrigemId })
    .from(actionsTable)
    .where(eq(actionsTable.clinicId, clinicId));
  const riskIdsWithCard = new Set(
    linkedRows.map((row) => row.riscoOrigemId).filter((v): v is string => v != null),
  );

  res.json(risks.map((r) => mapRisk(r, riskIdsWithCard.has(r.id))));
});

router.post("/clinics/:clinicId/risks", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const parsed = CreateRiskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { nome, descricao, probabilidade, impacto, pilarSlug, responsavel, acoesMitigadoras } = parsed.data;
  const severidade = probabilidade * impacto;

  const [risk] = await db
    .insert(risksTable)
    .values({
      clinicId,
      nome,
      descricao: descricao ?? null,
      probabilidade,
      impacto,
      severidade,
      pilarSlug: pilarSlug ?? null,
      responsavel: responsavel ?? null,
      acoesMitigadoras: acoesMitigadoras ?? null,
    })
    .returning();

  res.status(201).json(mapRisk(risk));
});

router.patch("/risks/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateRiskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(risksTable).where(eq(risksTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Risk not found" });
    return;
  }
  if (await assertClinicAccess(req, res, existing.clinicId)) return;

  const d = parsed.data;
  const probabilidade = d.probabilidade ?? existing.probabilidade;
  const impacto = d.impacto ?? existing.impacto;

  const updates: Partial<typeof risksTable.$inferInsert> = {
    probabilidade,
    impacto,
    severidade: probabilidade * impacto,
  };
  if (d.nome != null) updates.nome = d.nome;
  if (d.descricao !== undefined) updates.descricao = d.descricao;
  if (d.pilarSlug !== undefined) updates.pilarSlug = d.pilarSlug;
  if (d.responsavel !== undefined) updates.responsavel = d.responsavel;
  if (d.acoesMitigadoras !== undefined) updates.acoesMitigadoras = d.acoesMitigadoras;
  if (d.status != null) updates.status = d.status;
  if (d.statusJustificativa !== undefined) updates.statusJustificativa = d.statusJustificativa;

  // Invariant (source of truth): a risk marked "Não aceito" must carry a
  // non-empty justification; any other status clears it. Enforced here so
  // direct API callers can't bypass the client-side dialog/validation.
  const finalStatus = d.status ?? existing.status;
  if (finalStatus === "nao_aceito") {
    const justificativa =
      d.statusJustificativa !== undefined ? d.statusJustificativa : existing.statusJustificativa;
    if (!justificativa || !justificativa.trim()) {
      res.status(400).json({
        error: "A justificativa é obrigatória para marcar um risco como 'Não aceito'.",
      });
      return;
    }
    updates.statusJustificativa = justificativa.trim();
  } else {
    updates.statusJustificativa = null;
  }

  const risk = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(risksTable)
      .set(updates)
      .where(eq(risksTable.id, id))
      .returning();

    // Um risco "Não aceito" não deve ocupar o backlog do Plano de Ação:
    // remove os cards derivados deste risco que ainda estão na coluna `backlog`
    // (tarefas/subtarefas e itens-filhos saem em cascata). Idempotente — no-op
    // se não houver card no backlog. Cards já movidos para outras colunas
    // (trabalho em andamento/concluído) são preservados de propósito.
    if (finalStatus === "nao_aceito") {
      await tx
        .delete(actionsTable)
        .where(and(eq(actionsTable.riscoOrigemId, id), eq(actionsTable.coluna, "backlog")));
      return updated;
    }

    // O board é a fonte da verdade para riscos com card vinculado: após qualquer
    // alteração manual de status, re-deriva o status a partir do Kanban para que
    // um chamador direto da API não consiga colocar um risco vinculado num status
    // que contradiz seus cards. No-op (mantém o status manual) quando o risco não
    // tem nenhum card.
    await reconcileRiskStatus(tx, id);
    const [reconciled] = await tx.select().from(risksTable).where(eq(risksTable.id, id));
    return reconciled;
  });

  // temCard precisa refletir o estado real do board na resposta da mutação (e
  // não o default false), senão o cliente vê um valor que contradiz o banco até
  // o próximo refetch. Resolvido após a tx (o caminho "nao_aceito" pode ter
  // removido o card de backlog).
  const [linkedCard] = await db
    .select({ id: actionsTable.id })
    .from(actionsTable)
    .where(eq(actionsTable.riscoOrigemId, id))
    .limit(1);

  res.json(UpdateRiskResponse.parse(mapRisk(risk, linkedCard != null)));
});

// Aceitar um risco = decidir tratá-lo. Cria (se ainda não existir) um card no
// backlog do Plano de Ação vinculado ao risco e limpa qualquer override
// "Não aceito". O status passa a ser controlado pelo board (um card recém-criado
// no backlog mantém "identificado"). Idempotente: aceitar de novo não duplica
// cards nem altera o status já derivado do board.
router.post("/risks/:id/accept", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [existing] = await db.select().from(risksTable).where(eq(risksTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Risk not found" });
    return;
  }
  if (await assertClinicAccess(req, res, existing.clinicId)) return;

  const risk = await db.transaction(async (tx) => {
    // Trava a linha do risco durante o aceite: dois aceites concorrentes não
    // podem ambos observar "sem card" e acabar inserindo cards duplicados.
    await tx
      .select({ id: risksTable.id })
      .from(risksTable)
      .where(eq(risksTable.id, id))
      .for("update");

    const linked = await tx
      .select({ id: actionsTable.id })
      .from(actionsTable)
      .where(eq(actionsTable.riscoOrigemId, id));

    if (linked.length === 0) {
      const [maxOrdemRow] = await tx
        .select({ ordem: actionsTable.ordem })
        .from(actionsTable)
        .where(and(eq(actionsTable.clinicId, existing.clinicId), eq(actionsTable.coluna, "backlog")))
        .orderBy(desc(actionsTable.ordem))
        .limit(1);
      const nextOrdem = (maxOrdemRow?.ordem ?? 0) + 1;

      await tx.insert(actionsTable).values({
        clinicId: existing.clinicId,
        titulo: existing.nome,
        descricao: existing.acoesMitigadoras ?? existing.descricao ?? null,
        pilarSlug: existing.pilarSlug,
        prioridade: severidadeToPrioridade(existing.severidade),
        coluna: "backlog",
        ordem: nextOrdem,
        riscoOrigemId: id,
        camada: null,
      });
    }

    await tx
      .update(risksTable)
      .set({ status: "identificado", statusJustificativa: null })
      .where(eq(risksTable.id, id));

    await reconcileRiskStatus(tx, id);

    const [updated] = await tx.select().from(risksTable).where(eq(risksTable.id, id));
    return updated;
  });

  res.json(mapRisk(risk, true));
});


router.post("/clinics/:clinicId/risks/seed", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const [clinic] = await db.select({ plano: clinicsTable.plano }).from(clinicsTable).where(eq(clinicsTable.id, clinicId));
  const template = await getTemplateForPlan(clinic?.plano);

  const existing = await db
    .select({ nome: risksTable.nome })
    .from(risksTable)
    .where(eq(risksTable.clinicId, clinicId));

  const existingNames = new Set(existing.map(r => r.nome));
  const toCreate = template.risks.filter(r => !existingNames.has(r.nome));

  if (toCreate.length === 0) {
    res.json({ created: 0, message: "Todos os riscos ICS já foram inseridos." });
    return;
  }

  const created = await db
    .insert(risksTable)
    .values(
      toCreate.map(r => ({
        clinicId,
        nome: r.nome,
        descricao: r.descricao,
        probabilidade: r.probabilidade,
        impacto: r.impacto,
        severidade: r.probabilidade * r.impacto,
        pilarSlug: r.pilarSlug,
        responsavel: null,
        acoesMitigadoras: r.acoesMitigadoras,
        status: "identificado" as const,
      }))
    )
    .returning();

  res.status(201).json({ created: created.length, risks: created.map((r) => mapRisk(r)) });
});

async function loadConcludedDiagnostic(
  req: Parameters<Parameters<typeof router.post>[1]>[0],
  res: Parameters<Parameters<typeof router.post>[1]>[1],
): Promise<{ clinicId: string; diagnosticId: string } | null> {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const diagnosticId = Array.isArray(req.params.diagnosticId)
    ? req.params.diagnosticId[0]
    : req.params.diagnosticId;

  const [diagnostic] = await db
    .select()
    .from(diagnosticsTable)
    .where(eq(diagnosticsTable.id, diagnosticId));

  if (!diagnostic || diagnostic.clinicId !== clinicId) {
    res.status(404).json({ error: "Diagnostic not found" });
    return null;
  }

  if (diagnostic.status !== "concluido") {
    res.status(422).json({
      error: "O diagnóstico precisa estar concluído para gerar riscos.",
    });
    return null;
  }

  return { clinicId, diagnosticId };
}

/**
 * Step 1 of the review flow: synthesise risks from the diagnostic's weak answers
 * with the AI and return them as drafts. Nothing is persisted here — the manager
 * reviews and edits the drafts before committing.
 */
router.post(
  "/clinics/:clinicId/diagnostics/:diagnosticId/generate-risks/preview",
  async (req, res): Promise<void> => {
    if ((req as unknown as AuthenticatedRequest).user?.role !== "super_admin") {
      res.status(403).json({ error: "Apenas super_admin pode gerar riscos a partir do diagnóstico." });
      return;
    }
    const ctx = await loadConcludedDiagnostic(req, res);
    if (!ctx) return;

    const weak = await collectWeakAnswers(ctx.diagnosticId);
    if (weak.length === 0) {
      res.json({
        message: "Nenhuma resposta fraca encontrada neste diagnóstico.",
        risks: [],
      });
      return;
    }

    let generated;
    try {
      generated = await generateRisksFromWeakAnswers(weak);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      req.log.error({ err }, "risk generation failed");
      res.status(502).json({ error: `Falha ao gerar riscos: ${message}` });
      return;
    }

    if (generated.length === 0) {
      res.json({
        message: "A IA não conseguiu sintetizar riscos a partir das respostas.",
        risks: [],
      });
      return;
    }

    // A camada é derivada SEMPRE do score do pilar (servidor), nunca da IA/cliente.
    const scores = await loadPilarScores(ctx.clinicId);

    res.json({
      message: `${generated.length} risco(s) gerado(s) para revisão.`,
      risks: generated.map((g) => {
        const pilarScore = scores.get(g.pilarSlug)?.score ?? null;
        return {
          pilarSlug: g.pilarSlug,
          nome: g.nome,
          descricao: g.descricao,
          probabilidade: g.probabilidade,
          impacto: g.impacto,
          severidade: g.severidade,
          nivel: g.nivel,
          acoesMitigadoras: g.acoesMitigadoras,
          perguntasFonte: g.perguntasFonte,
          tarefasSugeridas: g.tarefasSugeridas,
          camada: camadaForScore(pilarScore),
          pilarScore,
          subtarefas: g.subtarefas,
          fases: g.fases,
        };
      }),
    });
  },
);

/**
 * Step 2 of the review flow: persist the manager-reviewed risks and create
 * action-plan cards only for the risks the manager explicitly selected
 * (criarCard). Previously derived risks for this diagnostic are replaced.
 */
router.post(
  "/clinics/:clinicId/diagnostics/:diagnosticId/generate-risks/commit",
  async (req, res): Promise<void> => {
    if ((req as unknown as AuthenticatedRequest).user?.role !== "super_admin") {
      res.status(403).json({ error: "Apenas super_admin pode gerar riscos a partir do diagnóstico." });
      return;
    }
    const ctx = await loadConcludedDiagnostic(req, res);
    if (!ctx) return;
    const { clinicId, diagnosticId } = ctx;

    const parsed = CommitRisksFromDiagnosticBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // A camada é recomputada no servidor a partir do score do pilar; os IDs de
    // resposta vindos do cliente são re-validados contra ESTE diagnóstico (um ID
    // forjado ou de outro diagnóstico vira null, preservando o snapshot textual).
    const [scores, validRespostas] = await Promise.all([
      loadPilarScores(clinicId),
      db
        .select({ id: respostasTable.id })
        .from(respostasTable)
        .where(eq(respostasTable.diagnosticoId, diagnosticId)),
    ]);
    const validRespostaIds = new Set(validRespostas.map((r) => r.id));
    const cleanOrigem = (id: string | null | undefined): string | null =>
      id && validRespostaIds.has(id) ? id : null;
    const mapSubtarefa = (s: {
      titulo: string;
      respostaOrigemId?: string | null;
      origemPergunta?: string | null;
      origemResposta?: string | null;
    }): PlanoSubtarefa => ({
      titulo: s.titulo,
      respostaOrigemId: cleanOrigem(s.respostaOrigemId),
      origemPergunta: s.origemPergunta ?? null,
      origemResposta: s.origemResposta ?? null,
    });

    const items = parsed.data.risks
      .map((r) => {
        const nome = r.nome.trim();
        if (!nome) return null;
        const probabilidade = Math.min(5, Math.max(1, Math.round(r.probabilidade)));
        const impacto = Math.min(5, Math.max(1, Math.round(r.impacto)));
        const severidade = probabilidade * impacto;
        const pilarSlug = r.pilarSlug ?? null;
        const perguntasFonte = (r.perguntasFonte ?? []).map((pf) => ({
          pergunta: pf.pergunta,
          resposta: pf.resposta,
          pilarSlug: pf.pilarSlug ?? null,
          respostaId: cleanOrigem(pf.respostaId),
          perguntaId: pf.perguntaId ?? null,
        })) as PerguntaFonte[];
        const subtarefas: PlanoSubtarefa[] = (r.subtarefas ?? []).map(mapSubtarefa);
        const fases: PlanoFase[] = (r.fases ?? []).map((f) => ({
          titulo: f.titulo,
          descricao: f.descricao ?? null,
          subtarefas: (f.subtarefas ?? []).map(mapSubtarefa),
        }));
        return {
          nome,
          descricao: r.descricao?.trim() || null,
          probabilidade,
          impacto,
          severidade,
          nivel: severidadeToNivel(severidade),
          pilarSlug,
          acoesMitigadoras: r.acoesMitigadoras?.trim() || null,
          perguntasFonte,
          criarCard: r.criarCard,
          tarefasSugeridas: sanitizeTarefaTitles(r.tarefasSugeridas),
          camada: camadaForScore(pilarSlug ? scores.get(pilarSlug)?.score ?? null : null),
          subtarefas,
          fases,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (items.length === 0) {
      res.json({
        created: 0,
        cardsCreated: 0,
        message: "Nenhum risco selecionado para salvar.",
        risks: [],
      });
      return;
    }

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`generate-risks:${diagnosticId}`}))`);

      const oldDerived = await tx
        .select({ id: risksTable.id })
        .from(risksTable)
        .where(
          and(
            eq(risksTable.clinicId, clinicId),
            eq(risksTable.origem, "diagnostico"),
            eq(risksTable.diagnosticoId, diagnosticId),
          ),
        );

      const oldIds = oldDerived.map((r) => r.id);
      if (oldIds.length > 0) {
        await tx.delete(actionsTable).where(inArray(actionsTable.riscoOrigemId, oldIds));
        await tx.delete(risksTable).where(inArray(risksTable.id, oldIds));
      }

      const insertedRisks = await tx
        .insert(risksTable)
        .values(
          items.map((g) => ({
            clinicId,
            nome: g.nome,
            descricao: g.descricao,
            probabilidade: g.probabilidade,
            impacto: g.impacto,
            severidade: g.severidade,
            pilarSlug: g.pilarSlug,
            responsavel: null,
            acoesMitigadoras: g.acoesMitigadoras,
            status: "identificado" as const,
            origem: "diagnostico",
            nivel: g.nivel,
            diagnosticoId: diagnosticId,
            perguntasFonte: g.perguntasFonte,
          })),
        )
        .returning();

      const [maxOrdemRow] = await tx
        .select({ ordem: actionsTable.ordem })
        .from(actionsTable)
        .where(and(eq(actionsTable.clinicId, clinicId), eq(actionsTable.coluna, "backlog")))
        .orderBy(desc(actionsTable.ordem))
        .limit(1);

      let nextOrdem = (maxOrdemRow?.ordem ?? 0) + 1;

      // Pareia cada risco inserido com seu item de origem (preserva a ordem da
      // inserção) e mantém só os marcados para virar card.
      const cardItems = insertedRisks
        .map((risk, i) => ({ risk, item: items[i] }))
        .filter(({ item }) => item.criarCard);

      if (cardItems.length > 0) {
        const insertedActions = await tx
          .insert(actionsTable)
          .values(
            cardItems.map(({ risk, item }) => ({
              clinicId,
              titulo: risk.nome,
              descricao: risk.acoesMitigadoras ?? risk.descricao ?? null,
              pilarSlug: risk.pilarSlug,
              prioridade:
                risk.nivel === "alto" ? "alta" : risk.nivel === "medio" ? "media" : "baixa",
              coluna: "backlog",
              ordem: nextOrdem++,
              riscoOrigemId: risk.id,
              camada: item.camada,
            })),
          )
          .returning();

        // INSERT...RETURNING preserva a ordem de cardItems → mesma posição. As
        // tarefas são montadas conforme a camada (pontual/consolidada/estrutural).
        for (let i = 0; i < insertedActions.length; i++) {
          const item = cardItems[i].item;
          await createPlanoTarefas(tx, insertedActions[i].id, item.camada, {
            tarefasSugeridas: item.tarefasSugeridas,
            subtarefas: item.subtarefas,
            fases: item.fases,
          });
        }
      }

      return { insertedRisks, cardsCreated: cardItems.length };
    });

    res.status(201).json({
      created: result.insertedRisks.length,
      cardsCreated: result.cardsCreated,
      message: `${result.insertedRisks.length} risco(s) salvo(s) do diagnóstico.`,
      risks: result.insertedRisks.map((r) => mapRisk(r)),
    });
  },
);

router.delete("/risks/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [existing] = await db
    .select({ clinicId: risksTable.clinicId })
    .from(risksTable)
    .where(eq(risksTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Risk not found" });
    return;
  }
  if (await assertClinicAccess(req, res, existing.clinicId)) return;

  await db.delete(risksTable).where(eq(risksTable.id, id));
  res.sendStatus(204);
});

export default router;
