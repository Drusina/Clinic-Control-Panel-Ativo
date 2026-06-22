import { Router, type IRouter } from "express";
import { eq, and, asc, sql, isNull, inArray } from "drizzle-orm";
import {
  db,
  actionsTable,
  clinicsTable,
  risksTable,
  evidenciasTable,
  acaoChecklistItensTable,
  acaoEvidenciasTable,
  acaoNotasTable,
  acaoTarefasTable,
  teamTable,
} from "@workspace/db";
import { assertClinicAccess, type AuthenticatedRequest } from "../middleware/auth";
import {
  CreateActionBody,
  UpdateActionBody,
  ListActionsQueryParams,
  UpdateActionResponse,
  AddChecklistItemBody,
  UpdateChecklistItemBody,
  LinkActionEvidenciaBody,
  AddActionNotaBody,
  CreateTarefaBody,
  UpdateTarefaBody,
  ListClinicTarefasQueryParams,
  SuggestActionTarefasBody,
  BatchCreateTarefasBody,
} from "@workspace/api-zod";
import { getTemplateForPlan } from "../lib/ics-seed.js";
import { createSuggestedTarefas, sanitizeTarefaTitles } from "../lib/tarefas.js";
import { suggestTarefasForAction } from "../lib/tarefa-suggester.js";
import { regenerateTarefasForClinic } from "../lib/tarefa-regenerator.js";
import {
  sendEmail,
  buildActionUpdateEmail,
  buildTarefaAssignedEmail,
  resolveAppUrl,
} from "../lib/email.js";
import { getRecipientPrefs } from "../lib/preferences.js";
import { sendPushToEmail } from "../lib/push.js";
import { logger } from "../lib/logger.js";
import {
  loadPilarScores,
  buildOrigemDiagnostico,
  type OrigemDiagnostico,
} from "../lib/origem-diagnostico.js";

const router: IRouter = Router();

function mapAction(
  a: typeof actionsTable.$inferSelect,
  progress?: { total: number; concluidas: number },
  origemDiagnostico: OrigemDiagnostico | null = null,
) {
  return {
    id: a.id,
    clinicId: a.clinicId,
    titulo: a.titulo,
    descricao: a.descricao,
    responsavelNome: a.responsavelNome,
    dataInicio: a.dataInicio,
    prazo: a.prazo,
    prioridade: a.prioridade,
    pilarSlug: a.pilarSlug,
    evidencias: a.evidencias,
    coluna: a.coluna,
    ordem: a.ordem,
    riscoOrigemId: a.riscoOrigemId,
    concluidoEm: a.concluidoEm?.toISOString() ?? null,
    tarefasTotal: progress?.total ?? 0,
    tarefasConcluidas: progress?.concluidas ?? 0,
    origemDiagnostico,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

/**
 * Aggregate top-level tarefa progress (parentTarefaId IS NULL) for a set of
 * actions in a single grouped query — avoids N+1 across the Kanban/list. Returns
 * a Map keyed by acaoId; actions with no tarefas are simply absent (callers
 * default to 0/0 via `mapAction`).
 */
async function getProgressMap(
  acaoIds: string[],
): Promise<Map<string, { total: number; concluidas: number }>> {
  const map = new Map<string, { total: number; concluidas: number }>();
  if (acaoIds.length === 0) return map;
  const rows = await db
    .select({
      acaoId: acaoTarefasTable.acaoId,
      total: sql<number>`cast(count(*) as int)`,
      concluidas: sql<number>`cast(count(*) filter (where ${acaoTarefasTable.status} = 'concluida') as int)`,
    })
    .from(acaoTarefasTable)
    .where(
      and(
        inArray(acaoTarefasTable.acaoId, acaoIds),
        isNull(acaoTarefasTable.parentTarefaId),
      ),
    )
    .groupBy(acaoTarefasTable.acaoId);
  for (const r of rows) {
    map.set(r.acaoId, { total: Number(r.total), concluidas: Number(r.concluidas) });
  }
  return map;
}

type TarefaDTO = {
  id: string;
  acaoId: string;
  parentTarefaId: string | null;
  titulo: string;
  descricao: string | null;
  responsavelNome: string | null;
  responsavelEmail: string | null;
  dataInicio: string | null;
  prazo: string | null;
  status: string;
  ordem: number;
  concluidaEm: string | null;
  createdAt: string;
  updatedAt: string;
  subtarefas?: TarefaDTO[];
};

function mapTarefa(
  t: typeof acaoTarefasTable.$inferSelect,
  subtarefas?: TarefaDTO[],
): TarefaDTO {
  return {
    id: t.id,
    acaoId: t.acaoId,
    parentTarefaId: t.parentTarefaId,
    titulo: t.titulo,
    descricao: t.descricao,
    responsavelNome: t.responsavelNome,
    responsavelEmail: t.responsavelEmail,
    dataInicio: t.dataInicio,
    prazo: t.prazo,
    status: t.status,
    ordem: t.ordem,
    concluidaEm: t.concluidaEm?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    ...(subtarefas ? { subtarefas } : {}),
  };
}

function mapClinicTarefa(
  t: typeof acaoTarefasTable.$inferSelect,
  acaoTitulo: string,
  coluna: string,
  clinicId: string,
) {
  return {
    id: t.id,
    acaoId: t.acaoId,
    acaoTitulo,
    clinicId,
    parentTarefaId: t.parentTarefaId,
    titulo: t.titulo,
    responsavelNome: t.responsavelNome,
    responsavelEmail: t.responsavelEmail,
    dataInicio: t.dataInicio,
    prazo: t.prazo,
    status: t.status,
    coluna,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/**
 * True when `email` belongs to a member of the given clinic's `equipe_interna`
 * (case-insensitive). Used to keep a tarefa's responsável scoped to its own
 * clinic so a notification can never be addressed to an outside identity.
 */
async function isClinicTeamEmail(clinicId: string, email: string): Promise<boolean> {
  const [member] = await db
    .select({ email: teamTable.email })
    .from(teamTable)
    .where(
      and(
        eq(teamTable.clinicId, clinicId),
        sql`lower(${teamTable.email}) = lower(${email})`,
      ),
    )
    .limit(1);
  return Boolean(member);
}

function mapChecklistItem(c: typeof acaoChecklistItensTable.$inferSelect) {
  return {
    id: c.id,
    acaoId: c.acaoId,
    texto: c.texto,
    feito: c.feito,
    ordem: c.ordem,
    createdAt: c.createdAt.toISOString(),
  };
}

function mapNota(n: typeof acaoNotasTable.$inferSelect) {
  return {
    id: n.id,
    acaoId: n.acaoId,
    autor: n.autor,
    texto: n.texto,
    createdAt: n.createdAt.toISOString(),
  };
}

function mapEvidenciaLink(
  link: typeof acaoEvidenciasTable.$inferSelect,
  ev: typeof evidenciasTable.$inferSelect,
) {
  return {
    id: link.id,
    evidenciaId: ev.id,
    nome: ev.nome,
    pilarSlug: ev.pilarSlug,
    tipo: ev.tipo,
    storagePath: ev.storagePath,
    createdAt: link.createdAt.toISOString(),
  };
}

async function loadAction(id: string) {
  const [action] = await db
    .select()
    .from(actionsTable)
    .where(eq(actionsTable.id, id))
    .limit(1);
  return action ?? null;
}

router.get("/clinics/:clinicId/actions", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const qp = ListActionsQueryParams.safeParse(req.query);
  if (!qp.success) {
    res.status(400).json({ error: qp.error.message });
    return;
  }

  const conditions = [eq(actionsTable.clinicId, clinicId)];
  if (qp.data.coluna) conditions.push(eq(actionsTable.coluna, qp.data.coluna));

  const actions = await db
    .select()
    .from(actionsTable)
    .where(and(...conditions))
    .orderBy(actionsTable.ordem);

  const [progressMap, pilarScores] = await Promise.all([
    getProgressMap(actions.map((a) => a.id)),
    loadPilarScores(clinicId),
  ]);
  res.json(
    actions.map((a) =>
      mapAction(a, progressMap.get(a.id), buildOrigemDiagnostico(a.pilarSlug, pilarScores)),
    ),
  );
});

router.post("/clinics/:clinicId/actions", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const parsed = CreateActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Tarefas sugeridas (somente títulos) são opcionais e criadas junto com a ação
  // na mesma transação para manter "ação + tarefas" atômico.
  const tarefasSugeridas = sanitizeTarefaTitles(parsed.data.tarefasSugeridas);

  const action = await db.transaction(async (tx) => {
    const [a] = await tx
      .insert(actionsTable)
      .values({
        clinicId,
        titulo: parsed.data.titulo,
        descricao: parsed.data.descricao ?? null,
        responsavelNome: parsed.data.responsavelNome ?? null,
        dataInicio: parsed.data.dataInicio ?? null,
        prazo: parsed.data.prazo ?? null,
        prioridade: parsed.data.prioridade ?? null,
        pilarSlug: parsed.data.pilarSlug ?? null,
        evidencias: parsed.data.evidencias ?? null,
        coluna: parsed.data.coluna ?? "backlog",
      })
      .returning();
    if (tarefasSugeridas.length > 0) {
      await createSuggestedTarefas(tx, a.id, tarefasSugeridas);
    }
    return a;
  });

  res.status(201).json(
    mapAction(action, { total: tarefasSugeridas.length, concluidas: 0 }),
  );
});

/**
 * Suggest execution-task titles for a (not yet created) action. Uses the AI with
 * a timeout and a curated fallback so it never blocks the manager. Returns only
 * titles plus the `source` ("ai" | "fallback"). Nothing is persisted here.
 * Auth is the mount-level requireClinicAccess on /clinics/:clinicId/...
 */
router.post("/clinics/:clinicId/actions/suggest-tarefas", async (req, res): Promise<void> => {
  const parsed = SuggestActionTarefasBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await suggestTarefasForAction({
    titulo: parsed.data.titulo,
    descricao: parsed.data.descricao ?? null,
    pilarSlug: parsed.data.pilarSlug ?? null,
  });
  res.json(result);
});

/**
 * Backfill único, acionável SOMENTE pelo super-admin: (re)gera as tarefas
 * sugeridas (somente títulos) de TODAS as ações já existentes da clínica.
 * Ações do plano padrão reaproveitam a biblioteca curada; ações de risco/manuais
 * usam a IA (com timeout + fallback, nunca quebra). As tarefas existentes são
 * SUBSTITUÍDAS; os demais campos da ação são preservados. Idempotente.
 *
 * Auth: a montagem já aplica requireClinicAccess; aqui exigimos super_admin
 * explicitamente (o acionamento da regeneração é operação de operador, não do
 * gestor da clínica).
 */
router.post("/clinics/:clinicId/actions/regenerate-tarefas", async (req, res): Promise<void> => {
  if ((req as unknown as AuthenticatedRequest).user?.role !== "super_admin") {
    res.status(403).json({ error: "Apenas super_admin pode regenerar tarefas das ações." });
    return;
  }
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const result = await regenerateTarefasForClinic(clinicId);
  res.json(result);
});

router.patch("/actions/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existingAction] = await db
    .select({ clinicId: actionsTable.clinicId })
    .from(actionsTable)
    .where(eq(actionsTable.id, id))
    .limit(1);
  if (!existingAction) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (await assertClinicAccess(req, res, existingAction.clinicId)) return;

  const updates: Partial<typeof actionsTable.$inferInsert> = {};
  const d = parsed.data;
  if (d.titulo != null) updates.titulo = d.titulo;
  if (d.descricao !== undefined) updates.descricao = d.descricao;
  if (d.responsavelNome !== undefined) updates.responsavelNome = d.responsavelNome;
  if (d.dataInicio !== undefined) updates.dataInicio = d.dataInicio;
  if (d.prazo !== undefined) updates.prazo = d.prazo;
  if (d.prioridade !== undefined) updates.prioridade = d.prioridade;
  if (d.pilarSlug !== undefined) updates.pilarSlug = d.pilarSlug;
  if (d.evidencias !== undefined) updates.evidencias = d.evidencias;
  if (d.coluna != null) {
    updates.coluna = d.coluna;
    if (d.coluna === "done") updates.concluidoEm = new Date();
  }
  if (d.ordem != null) updates.ordem = d.ordem;
  updates.updatedAt = new Date();

  const [action] = await db
    .update(actionsTable)
    .set(updates)
    .where(eq(actionsTable.id, id))
    .returning();

  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }

  const progressMap = await getProgressMap([action.id]);
  res.json(UpdateActionResponse.parse(mapAction(action, progressMap.get(action.id))));
});


router.post("/clinics/:clinicId/actions/seed", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const [clinic] = await db.select({ plano: clinicsTable.plano }).from(clinicsTable).where(eq(clinicsTable.id, clinicId));
  const template = await getTemplateForPlan(clinic?.plano);

  const existing = await db
    .select({ titulo: actionsTable.titulo })
    .from(actionsTable)
    .where(eq(actionsTable.clinicId, clinicId));

  const existingTitles = new Set(existing.map(a => a.titulo));
  const toCreate = template.actions.filter(a => !existingTitles.has(a.titulo));

  if (toCreate.length === 0) {
    res.json({ created: 0, message: "Todas as ações ICS já foram inseridas." });
    return;
  }

  const now = new Date();
  const created = await db
    .insert(actionsTable)
    .values(
      toCreate.map(a => ({
        clinicId,
        titulo: a.titulo,
        descricao: a.descricao,
        pilarSlug: a.pilarSlug,
        prioridade: a.prioridade,
        coluna: a.coluna,
        ordem: a.ordem,
        responsavelNome: null,
        prazo: null,
        evidencias: null,
        concluidoEm: a.coluna === "done" ? now : null,
      }))
    )
    .returning();

  res.status(201).json({ created: created.length, actions: created.map((a) => mapAction(a)) });
});

router.delete("/actions/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [existingAction] = await db
    .select({ clinicId: actionsTable.clinicId })
    .from(actionsTable)
    .where(eq(actionsTable.id, id))
    .limit(1);
  if (!existingAction) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (await assertClinicAccess(req, res, existingAction.clinicId)) return;

  await db.delete(actionsTable).where(eq(actionsTable.id, id));
  res.sendStatus(204);
});

// ─── ACTION DETAIL ──────────────────────────────────────────────────────────

router.get("/actions/:id/detail", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const action = await loadAction(id);
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (await assertClinicAccess(req, res, action.clinicId)) return;

  let riscoVinculado = null;
  if (action.riscoOrigemId) {
    const [risk] = await db
      .select()
      .from(risksTable)
      .where(eq(risksTable.id, action.riscoOrigemId))
      .limit(1);
    if (risk) {
      riscoVinculado = {
        id: risk.id,
        nome: risk.nome,
        probabilidade: risk.probabilidade,
        impacto: risk.impacto,
        severidade: risk.severidade,
        nivel: risk.nivel,
      };
    }
  }

  const checklist = await db
    .select()
    .from(acaoChecklistItensTable)
    .where(eq(acaoChecklistItensTable.acaoId, id))
    .orderBy(asc(acaoChecklistItensTable.ordem), asc(acaoChecklistItensTable.createdAt));

  // Tarefas — loaded flat (ordered), then assembled into a one-level tree.
  const tarefaRows = await db
    .select()
    .from(acaoTarefasTable)
    .where(eq(acaoTarefasTable.acaoId, id))
    .orderBy(asc(acaoTarefasTable.ordem), asc(acaoTarefasTable.createdAt));

  const childrenByParent = new Map<string, typeof tarefaRows>();
  for (const t of tarefaRows) {
    if (t.parentTarefaId) {
      const arr = childrenByParent.get(t.parentTarefaId) ?? [];
      arr.push(t);
      childrenByParent.set(t.parentTarefaId, arr);
    }
  }
  const topLevel = tarefaRows.filter((t) => t.parentTarefaId === null);
  const tarefas = topLevel.map((t) =>
    mapTarefa(
      t,
      (childrenByParent.get(t.id) ?? []).map((c) => mapTarefa(c)),
    ),
  );
  const progress = {
    total: topLevel.length,
    concluidas: topLevel.filter((t) => t.status === "concluida").length,
  };

  const evidenciaRows = await db
    .select({ link: acaoEvidenciasTable, ev: evidenciasTable })
    .from(acaoEvidenciasTable)
    .innerJoin(evidenciasTable, eq(acaoEvidenciasTable.evidenciaId, evidenciasTable.id))
    .where(eq(acaoEvidenciasTable.acaoId, id))
    .orderBy(asc(acaoEvidenciasTable.createdAt));

  const notas = await db
    .select()
    .from(acaoNotasTable)
    .where(eq(acaoNotasTable.acaoId, id))
    .orderBy(asc(acaoNotasTable.createdAt));

  const pilarScores = await loadPilarScores(action.clinicId);
  const origemDiagnostico = buildOrigemDiagnostico(action.pilarSlug, pilarScores);

  res.json({
    action: mapAction(action, progress, origemDiagnostico),
    riscoVinculado,
    checklist: checklist.map(mapChecklistItem),
    tarefas,
    evidencias: evidenciaRows.map((r) => mapEvidenciaLink(r.link, r.ev)),
    notas: notas.map(mapNota),
  });
});

// ─── CHECKLIST ──────────────────────────────────────────────────────────────

router.post("/actions/:id/checklist", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = AddChecklistItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const action = await loadAction(id);
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (await assertClinicAccess(req, res, action.clinicId)) return;

  const existing = await db
    .select({ ordem: acaoChecklistItensTable.ordem })
    .from(acaoChecklistItensTable)
    .where(eq(acaoChecklistItensTable.acaoId, id));
  const nextOrdem = existing.reduce((max, c) => Math.max(max, c.ordem), -1) + 1;

  const [item] = await db
    .insert(acaoChecklistItensTable)
    .values({ acaoId: id, texto: parsed.data.texto, ordem: nextOrdem })
    .returning();

  // Optionally notify the action's responsável about the new checklist item
  // (best-effort: never fails the insert). See notifyResponsavelOfActionUpdate.
  if (parsed.data.notificar && action.responsavelNome?.trim()) {
    void notifyResponsavelOfActionUpdate("checklist", action, item.texto).catch((err) => {
      logger.error(
        { err, acaoId: id, clinicId: action.clinicId },
        "Failed to notify responsável about new checklist item",
      );
    });
  }

  res.status(201).json(mapChecklistItem(item));
});

router.patch("/actions/:id/checklist/:itemId", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
  const parsed = UpdateChecklistItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const action = await loadAction(id);
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (await assertClinicAccess(req, res, action.clinicId)) return;

  const updates: Partial<typeof acaoChecklistItensTable.$inferInsert> = {};
  if (parsed.data.texto != null) updates.texto = parsed.data.texto;
  if (parsed.data.feito != null) updates.feito = parsed.data.feito;

  const [item] = await db
    .update(acaoChecklistItensTable)
    .set(updates)
    .where(and(eq(acaoChecklistItensTable.id, itemId), eq(acaoChecklistItensTable.acaoId, id)))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Checklist item not found" });
    return;
  }
  res.json(mapChecklistItem(item));
});

router.delete("/actions/:id/checklist/:itemId", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
  const action = await loadAction(id);
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (await assertClinicAccess(req, res, action.clinicId)) return;

  await db
    .delete(acaoChecklistItensTable)
    .where(and(eq(acaoChecklistItensTable.id, itemId), eq(acaoChecklistItensTable.acaoId, id)));
  res.sendStatus(204);
});

// ─── TAREFAS ────────────────────────────────────────────────────────────────

router.post("/actions/:id/tarefas", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = CreateTarefaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const action = await loadAction(id);
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (await assertClinicAccess(req, res, action.clinicId)) return;

  // Subtarefa: the parent must belong to the same action and itself be top-level
  // (we only support one level of nesting).
  const parentTarefaId = parsed.data.parentTarefaId ?? null;
  if (parentTarefaId) {
    const [parent] = await db
      .select({
        id: acaoTarefasTable.id,
        acaoId: acaoTarefasTable.acaoId,
        parentTarefaId: acaoTarefasTable.parentTarefaId,
      })
      .from(acaoTarefasTable)
      .where(eq(acaoTarefasTable.id, parentTarefaId))
      .limit(1);
    if (!parent || parent.acaoId !== id) {
      res.status(400).json({ error: "Tarefa-mãe inválida para esta ação" });
      return;
    }
    if (parent.parentTarefaId) {
      res.status(400).json({ error: "Subtarefas não podem ter subtarefas" });
      return;
    }
  }

  const responsavelEmail = parsed.data.responsavelEmail?.trim() || null;
  if (responsavelEmail && !(await isClinicTeamEmail(action.clinicId, responsavelEmail))) {
    res.status(400).json({ error: "Responsável inválido para esta clínica" });
    return;
  }

  const siblings = await db
    .select({ ordem: acaoTarefasTable.ordem })
    .from(acaoTarefasTable)
    .where(
      and(
        eq(acaoTarefasTable.acaoId, id),
        parentTarefaId
          ? eq(acaoTarefasTable.parentTarefaId, parentTarefaId)
          : isNull(acaoTarefasTable.parentTarefaId),
      ),
    );
  const nextOrdem = siblings.reduce((max, s) => Math.max(max, s.ordem), -1) + 1;

  const status = parsed.data.status ?? "a_fazer";
  const [tarefa] = await db
    .insert(acaoTarefasTable)
    .values({
      acaoId: id,
      parentTarefaId,
      titulo: parsed.data.titulo,
      descricao: parsed.data.descricao ?? null,
      responsavelNome: parsed.data.responsavelNome ?? null,
      responsavelEmail,
      dataInicio: parsed.data.dataInicio ?? null,
      prazo: parsed.data.prazo ?? null,
      status,
      ordem: nextOrdem,
      concluidaEm: status === "concluida" ? new Date() : null,
    })
    .returning();

  if (responsavelEmail) {
    void notifyTarefaAssigned(action, tarefa).catch((err) => {
      logger.error(
        { err, acaoId: id, tarefaId: tarefa.id, clinicId: action.clinicId },
        "Failed to notify responsável about new tarefa assignment",
      );
    });
  }

  // Top-level tarefas carry an (initially empty) subtarefas array; subtarefas
  // themselves omit it.
  res.status(201).json(mapTarefa(tarefa, parentTarefaId ? undefined : []));
});

/**
 * Create multiple top-level tarefas (titles only) for an action in one call —
 * used when the manager accepts/edits AI-suggested tasks for an existing action.
 * Sanitizes/dedups titles and appends them after the action's current top-level
 * tarefas. Never sets responsável/datas/status.
 */
router.post("/actions/:id/tarefas/batch", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = BatchCreateTarefasBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const action = await loadAction(id);
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (await assertClinicAccess(req, res, action.clinicId)) return;

  const created = await db.transaction((tx) =>
    createSuggestedTarefas(tx, id, parsed.data.titulos),
  );

  res.status(201).json(created.map((t) => mapTarefa(t, [])));
});

router.patch("/actions/:id/tarefas/:tarefaId", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tarefaId = Array.isArray(req.params.tarefaId) ? req.params.tarefaId[0] : req.params.tarefaId;
  const parsed = UpdateTarefaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const action = await loadAction(id);
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (await assertClinicAccess(req, res, action.clinicId)) return;

  const [existing] = await db
    .select()
    .from(acaoTarefasTable)
    .where(and(eq(acaoTarefasTable.id, tarefaId), eq(acaoTarefasTable.acaoId, id)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Tarefa not found" });
    return;
  }

  const d = parsed.data;
  const updates: Partial<typeof acaoTarefasTable.$inferInsert> = {};
  if (d.titulo != null) updates.titulo = d.titulo;
  if (d.descricao !== undefined) updates.descricao = d.descricao;
  if (d.responsavelNome !== undefined) updates.responsavelNome = d.responsavelNome;

  let notifyAssignment = false;
  if (d.responsavelEmail !== undefined) {
    const email = d.responsavelEmail?.trim() || null;
    if (email && !(await isClinicTeamEmail(action.clinicId, email))) {
      res.status(400).json({ error: "Responsável inválido para esta clínica" });
      return;
    }
    updates.responsavelEmail = email;
    // Notify only when the assignee actually changes to a (non-null) person.
    if (email && email.toLowerCase() !== (existing.responsavelEmail ?? "").toLowerCase()) {
      notifyAssignment = true;
    }
  }
  if (d.dataInicio !== undefined) updates.dataInicio = d.dataInicio;
  if (d.prazo !== undefined) {
    updates.prazo = d.prazo;
    // A changed prazo re-arms the deadline reminder for the next daily run.
    updates.lembretePrazoEnviadoEm = null;
  }
  if (d.status != null) {
    updates.status = d.status;
    if (d.status === "concluida" && existing.status !== "concluida") {
      updates.concluidaEm = new Date();
    } else if (d.status !== "concluida" && existing.status === "concluida") {
      updates.concluidaEm = null;
    }
  }
  if (d.ordem != null) updates.ordem = d.ordem;
  updates.updatedAt = new Date();

  const [tarefa] = await db
    .update(acaoTarefasTable)
    .set(updates)
    .where(and(eq(acaoTarefasTable.id, tarefaId), eq(acaoTarefasTable.acaoId, id)))
    .returning();
  if (!tarefa) {
    res.status(404).json({ error: "Tarefa not found" });
    return;
  }

  if (notifyAssignment) {
    void notifyTarefaAssigned(action, tarefa).catch((err) => {
      logger.error(
        { err, acaoId: id, tarefaId: tarefa.id, clinicId: action.clinicId },
        "Failed to notify responsável about tarefa reassignment",
      );
    });
  }

  res.json(mapTarefa(tarefa, tarefa.parentTarefaId ? undefined : []));
});

router.delete("/actions/:id/tarefas/:tarefaId", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tarefaId = Array.isArray(req.params.tarefaId) ? req.params.tarefaId[0] : req.params.tarefaId;
  const action = await loadAction(id);
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (await assertClinicAccess(req, res, action.clinicId)) return;

  // FK onDelete cascade removes any subtarefas of this tarefa.
  await db
    .delete(acaoTarefasTable)
    .where(and(eq(acaoTarefasTable.id, tarefaId), eq(acaoTarefasTable.acaoId, id)));
  res.sendStatus(204);
});

/**
 * Notify a tarefa's responsável that it was assigned to them. Best-effort: each
 * channel swallows its own failure so a notification can never fail the write.
 * The responsável's email is validated to belong to the action's clinic before
 * this runs, and web push is resolved clinic-scoped so a duplicate email across
 * clinics can never receive another clinic's notification. Email respects the
 * recipient's `emailEnabled` preference.
 */
export async function notifyTarefaAssigned(
  action: typeof actionsTable.$inferSelect,
  tarefa: typeof acaoTarefasTable.$inferSelect,
): Promise<void> {
  const recipient = tarefa.responsavelEmail?.trim();
  if (!recipient) return;

  const [clinic] = await db
    .select({ nome: clinicsTable.nome })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, action.clinicId))
    .limit(1);
  const clinicName = clinic?.nome ?? "Clínica";

  const acaoPath = `/portal/clinica/${action.clinicId}/acao`;

  await sendPushToEmail(recipient, action.clinicId, {
    title: `Nova tarefa: ${tarefa.titulo}`,
    body: `Ação: ${action.titulo}`,
    url: acaoPath,
    tag: `tarefa-assign-${tarefa.id}`,
  }).catch(() => ({ sent: 0, failed: 0 }));

  const prefs = await getRecipientPrefs(recipient, action.clinicId);
  if (prefs.emailEnabled) {
    const appUrl = await resolveAppUrl();
    const html = buildTarefaAssignedEmail({
      clinicName,
      acaoTitulo: action.titulo,
      tarefaTitulo: tarefa.titulo,
      responsavelNome: tarefa.responsavelNome ?? recipient,
      prazo: tarefa.prazo,
      appUrl,
      acaoPath,
    });
    await sendEmail({
      to: recipient,
      subject: `[IONEX360] Nova tarefa atribuída: ${tarefa.titulo}`,
      html,
    }).catch(() => false);
  }
}

// ─── CLINIC-WIDE TAREFA AGGREGATION (dashboard) ─────────────────────────────

router.get("/clinics/:clinicId/tarefas", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const qp = ListClinicTarefasQueryParams.safeParse(req.query);
  if (!qp.success) {
    res.status(400).json({ error: qp.error.message });
    return;
  }

  // team_member callers are always scoped to their own tarefas; super_admin can
  // opt in with ?mine=true.
  const user = (req as unknown as AuthenticatedRequest).user;
  const myEmail = (user.email ?? user.sub ?? "").trim();
  const mine = user.role === "team_member" ? true : qp.data.mine === true;
  if (mine && !myEmail) {
    res.json([]);
    return;
  }

  const conditions = [eq(actionsTable.clinicId, clinicId)];
  if (mine) {
    conditions.push(sql`lower(${acaoTarefasTable.responsavelEmail}) = lower(${myEmail})`);
  }
  if (qp.data.status === "open") {
    conditions.push(sql`${acaoTarefasTable.status} <> 'concluida'`);
  } else if (qp.data.status) {
    conditions.push(eq(acaoTarefasTable.status, qp.data.status));
  }
  if (qp.data.from) conditions.push(sql`${acaoTarefasTable.prazo} >= ${qp.data.from}`);
  if (qp.data.to) conditions.push(sql`${acaoTarefasTable.prazo} <= ${qp.data.to}`);

  const rows = await db
    .select({ t: acaoTarefasTable, acaoTitulo: actionsTable.titulo, coluna: actionsTable.coluna })
    .from(acaoTarefasTable)
    .innerJoin(actionsTable, eq(acaoTarefasTable.acaoId, actionsTable.id))
    .where(and(...conditions))
    .orderBy(asc(acaoTarefasTable.prazo), asc(acaoTarefasTable.createdAt));

  res.json(rows.map((r) => mapClinicTarefa(r.t, r.acaoTitulo, r.coluna, clinicId)));
});

// ─── EVIDENCE LINKS ─────────────────────────────────────────────────────────

router.get("/actions/:id/evidencias", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const action = await loadAction(id);
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (await assertClinicAccess(req, res, action.clinicId)) return;

  const rows = await db
    .select({ link: acaoEvidenciasTable, ev: evidenciasTable })
    .from(acaoEvidenciasTable)
    .innerJoin(evidenciasTable, eq(acaoEvidenciasTable.evidenciaId, evidenciasTable.id))
    .where(eq(acaoEvidenciasTable.acaoId, id))
    .orderBy(asc(acaoEvidenciasTable.createdAt));

  res.json(rows.map((r) => mapEvidenciaLink(r.link, r.ev)));
});

router.post("/actions/:id/evidencias", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = LinkActionEvidenciaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const action = await loadAction(id);
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (await assertClinicAccess(req, res, action.clinicId)) return;

  const [ev] = await db
    .select()
    .from(evidenciasTable)
    .where(eq(evidenciasTable.id, parsed.data.evidenciaId))
    .limit(1);
  if (!ev || ev.clinicId !== action.clinicId) {
    res.status(400).json({ error: "Evidência inválida para esta clínica" });
    return;
  }

  const [existing] = await db
    .select()
    .from(acaoEvidenciasTable)
    .where(
      and(
        eq(acaoEvidenciasTable.acaoId, id),
        eq(acaoEvidenciasTable.evidenciaId, parsed.data.evidenciaId),
      ),
    )
    .limit(1);

  const link =
    existing ??
    (
      await db
        .insert(acaoEvidenciasTable)
        .values({ acaoId: id, evidenciaId: parsed.data.evidenciaId })
        .returning()
    )[0];

  res.status(existing ? 200 : 201).json(mapEvidenciaLink(link, ev));
});

router.delete("/actions/:id/evidencias/:linkId", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const linkId = Array.isArray(req.params.linkId) ? req.params.linkId[0] : req.params.linkId;
  const action = await loadAction(id);
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (await assertClinicAccess(req, res, action.clinicId)) return;

  await db
    .delete(acaoEvidenciasTable)
    .where(and(eq(acaoEvidenciasTable.id, linkId), eq(acaoEvidenciasTable.acaoId, id)));
  res.sendStatus(204);
});

// ─── COORDINATOR NOTES ──────────────────────────────────────────────────────

router.get("/actions/:id/notas", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const action = await loadAction(id);
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (await assertClinicAccess(req, res, action.clinicId)) return;

  const notas = await db
    .select()
    .from(acaoNotasTable)
    .where(eq(acaoNotasTable.acaoId, id))
    .orderBy(asc(acaoNotasTable.createdAt));
  res.json(notas.map(mapNota));
});

router.post("/actions/:id/notas", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = AddActionNotaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const action = await loadAction(id);
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (await assertClinicAccess(req, res, action.clinicId)) return;

  const [nota] = await db
    .insert(acaoNotasTable)
    .values({ acaoId: id, texto: parsed.data.texto, autor: parsed.data.autor ?? null })
    .returning();

  // Optionally notify the action's responsável (best-effort: a notification
  // failure must never fail the note insert). The responsável is identified by
  // name on the action, so we resolve their email by matching the clinic's
  // `equipe_interna` record case-insensitively by name. We respect the
  // recipient's email preference; web push is always attempted when available.
  if (parsed.data.notificar && action.responsavelNome?.trim()) {
    void notifyResponsavelOfActionUpdate("nota", action, nota.texto).catch((err) => {
      logger.error(
        { err, acaoId: id, clinicId: action.clinicId },
        "Failed to notify responsável about new coordinator note",
      );
    });
  }

  res.status(201).json(mapNota(nota));
});

/**
 * Notify an action's responsável that a new note or checklist item was added.
 * Best-effort: every channel swallows its own failure so the caller (the insert
 * handler) never fails because of a notification. The responsável is stored only
 * as a free-text name on the action, so we resolve their email by matching the
 * clinic's `equipe_interna` record case-insensitively by name (clinic-scoped, so
 * a duplicate name in another clinic can never receive this notification). Email
 * respects the recipient's `emailEnabled` preference; web push is always
 * attempted when a subscription exists.
 */
export async function notifyResponsavelOfActionUpdate(
  kind: "nota" | "checklist",
  action: typeof actionsTable.$inferSelect,
  texto: string,
): Promise<void> {
  const responsavelNome = action.responsavelNome?.trim();
  if (!responsavelNome) return;

  const [member] = await db
    .select({ email: teamTable.email, nome: teamTable.nome })
    .from(teamTable)
    .where(
      and(
        eq(teamTable.clinicId, action.clinicId),
        sql`lower(${teamTable.nome}) = lower(${responsavelNome})`,
      ),
    )
    .limit(1);

  const recipient = member?.email?.trim();
  if (!recipient) return;

  const [clinic] = await db
    .select({ nome: clinicsTable.nome })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, action.clinicId))
    .limit(1);
  const clinicName = clinic?.nome ?? "Clínica";

  const acaoPath = `/portal/clinica/${action.clinicId}/acao`;
  const isNota = kind === "nota";
  const pushTitle = `${isNota ? "Nova nota" : "Novo item"}: ${action.titulo}`;
  const subject = isNota
    ? `[IONEX360] Nova nota na ação: ${action.titulo}`
    : `[IONEX360] Novo item de checklist na ação: ${action.titulo}`;

  // Web push — clinic-scoped resolution so a duplicate email across clinics can
  // never receive another clinic's notification. Best-effort.
  await sendPushToEmail(recipient, action.clinicId, {
    title: pushTitle,
    body: texto.length > 120 ? `${texto.slice(0, 117)}…` : texto,
    url: acaoPath,
    tag: `acao-${kind}-${action.id}`,
  }).catch(() => ({ sent: 0, failed: 0 }));

  const prefs = await getRecipientPrefs(recipient, action.clinicId);
  if (prefs.emailEnabled) {
    const appUrl = await resolveAppUrl();
    const html = buildActionUpdateEmail({
      kind,
      clinicName,
      acaoTitulo: action.titulo,
      responsavelNome: member?.nome ?? responsavelNome,
      texto,
      appUrl,
      acaoPath,
    });
    await sendEmail({
      to: recipient,
      subject,
      html,
    }).catch(() => false);
  }
}

router.delete("/actions/:id/notas/:notaId", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const notaId = Array.isArray(req.params.notaId) ? req.params.notaId[0] : req.params.notaId;
  const action = await loadAction(id);
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (await assertClinicAccess(req, res, action.clinicId)) return;

  await db
    .delete(acaoNotasTable)
    .where(and(eq(acaoNotasTable.id, notaId), eq(acaoNotasTable.acaoId, id)));
  res.sendStatus(204);
});

export default router;
