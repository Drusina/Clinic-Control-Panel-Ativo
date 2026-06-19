import { Router, type IRouter } from "express";
import { eq, and, asc, sql } from "drizzle-orm";
import {
  db,
  actionsTable,
  clinicsTable,
  risksTable,
  evidenciasTable,
  acaoChecklistItensTable,
  acaoEvidenciasTable,
  acaoNotasTable,
  teamTable,
} from "@workspace/db";
import { assertClinicAccess } from "../middleware/auth";
import {
  CreateActionBody,
  UpdateActionBody,
  ListActionsQueryParams,
  UpdateActionResponse,
  AddChecklistItemBody,
  UpdateChecklistItemBody,
  LinkActionEvidenciaBody,
  AddActionNotaBody,
} from "@workspace/api-zod";
import { getTemplateForPlan } from "../lib/ics-seed.js";
import { sendEmail, buildActionUpdateEmail, resolveAppUrl } from "../lib/email.js";
import { getRecipientPrefs } from "../lib/preferences.js";
import { sendPushToEmail } from "../lib/push.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function mapAction(a: typeof actionsTable.$inferSelect) {
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
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
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

  res.json(actions.map(mapAction));
});

router.post("/clinics/:clinicId/actions", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const parsed = CreateActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [action] = await db
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

  res.status(201).json(mapAction(action));
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

  res.json(UpdateActionResponse.parse(mapAction(action)));
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

  res.status(201).json({ created: created.length, actions: created.map(mapAction) });
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

  res.json({
    action: mapAction(action),
    riscoVinculado,
    checklist: checklist.map(mapChecklistItem),
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

  const acaoPath = `/portal/clinica/${action.clinicId}/plano-de-acao`;
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
