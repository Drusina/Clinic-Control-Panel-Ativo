import { Router, type IRouter } from "express";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { db, risksTable, clinicsTable, diagnosticsTable, actionsTable } from "@workspace/db";
import { assertClinicAccess } from "../middleware/auth";
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
} from "../lib/risk-generator.js";
import type { PerguntaFonte } from "@workspace/db";

const router: IRouter = Router();

function mapRisk(r: typeof risksTable.$inferSelect) {
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
    origem: r.origem,
    nivel: r.nivel,
    diagnosticoId: r.diagnosticoId,
    perguntasFonte: r.perguntasFonte ?? null,
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

  res.json(risks.map(mapRisk));
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

  const [risk] = await db.update(risksTable).set(updates).where(eq(risksTable.id, id)).returning();

  res.json(UpdateRiskResponse.parse(mapRisk(risk)));
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

  res.status(201).json({ created: created.length, risks: created.map(mapRisk) });
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

    res.json({
      message: `${generated.length} risco(s) gerado(s) para revisão.`,
      risks: generated.map((g) => ({
        pilarSlug: g.pilarSlug,
        nome: g.nome,
        descricao: g.descricao,
        probabilidade: g.probabilidade,
        impacto: g.impacto,
        severidade: g.severidade,
        nivel: g.nivel,
        acoesMitigadoras: g.acoesMitigadoras,
        perguntasFonte: g.perguntasFonte,
      })),
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
    const ctx = await loadConcludedDiagnostic(req, res);
    if (!ctx) return;
    const { clinicId, diagnosticId } = ctx;

    const parsed = CommitRisksFromDiagnosticBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const items = parsed.data.risks
      .map((r) => {
        const nome = r.nome.trim();
        if (!nome) return null;
        const probabilidade = Math.min(5, Math.max(1, Math.round(r.probabilidade)));
        const impacto = Math.min(5, Math.max(1, Math.round(r.impacto)));
        const severidade = probabilidade * impacto;
        const perguntasFonte = (r.perguntasFonte ?? []).map((pf) => ({
          pergunta: pf.pergunta,
          resposta: pf.resposta,
          pilarSlug: pf.pilarSlug ?? null,
        })) as PerguntaFonte[];
        return {
          nome,
          descricao: r.descricao?.trim() || null,
          probabilidade,
          impacto,
          severidade,
          nivel: severidadeToNivel(severidade),
          pilarSlug: r.pilarSlug ?? null,
          acoesMitigadoras: r.acoesMitigadoras?.trim() || null,
          perguntasFonte,
          criarCard: r.criarCard,
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

      const cardRisks = insertedRisks.filter((_, i) => items[i].criarCard);
      if (cardRisks.length > 0) {
        await tx.insert(actionsTable).values(
          cardRisks.map((r) => ({
            clinicId,
            titulo: r.nome,
            descricao: r.acoesMitigadoras ?? r.descricao ?? null,
            pilarSlug: r.pilarSlug,
            prioridade: r.nivel === "alto" ? "alta" : r.nivel === "medio" ? "media" : "baixa",
            coluna: "backlog",
            ordem: nextOrdem++,
            riscoOrigemId: r.id,
          })),
        );
      }

      return { insertedRisks, cardsCreated: cardRisks.length };
    });

    res.status(201).json({
      created: result.insertedRisks.length,
      cardsCreated: result.cardsCreated,
      message: `${result.insertedRisks.length} risco(s) salvo(s) do diagnóstico.`,
      risks: result.insertedRisks.map(mapRisk),
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
