import { Router, type IRouter } from "express";
import { eq, and, count, sql } from "drizzle-orm";
import { db, delegacoesTable, clinicsTable, risksTable, actionsTable, teamTable } from "@workspace/db";
import { assertClinicAccess } from "../middleware/auth";
import { getTemplateForPlan } from "../lib/ics-seed.js";
import { z } from "zod";
import {
  sendEmail,
  buildDelegationEmail,
  buildRespondentInviteEmail,
  describeDelegationScope,
  resolveAppUrl,
} from "../lib/email.js";
import { generateInviteCode } from "../middleware/auth.js";
import { sendDelegationWhatsApp, isWhatsAppConfigured } from "../lib/whatsapp.js";
import { getRecipientPrefs } from "../lib/preferences.js";
import { sendPushToClinic, sendPushToEmail } from "../lib/push.js";

const router: IRouter = Router();

function mapDelegacao(d: typeof delegacoesTable.$inferSelect) {
  return {
    id: d.id,
    clinicId: d.clinicId,
    pilarSlug: d.pilarSlug,
    pilarNome: d.pilarNome,
    nivel: d.nivel,
    responsavelNome: d.responsavelNome,
    responsavelEmail: d.responsavelEmail,
    prazo: d.prazo,
    status: d.status,
    questaoInicio: d.questaoInicio,
    questaoFim: d.questaoFim,
    parentId: d.parentId,
    observacoes: d.observacoes,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

const CreateDelegacaoBody = z.object({
  pilarSlug: z.string(),
  pilarNome: z.string(),
  nivel: z.number().int().min(1).max(2).optional().default(1),
  responsavelNome: z.string().optional(),
  responsavelEmail: z.string().email().optional(),
  responsavelWhatsapp: z.string().optional(),
  prazo: z.string().optional(),
  status: z.enum(["nao_delegado", "pendente", "andamento", "concluido", "atrasado"]).optional().default("pendente"),
  questaoInicio: z.number().int().optional(),
  questaoFim: z.number().int().optional(),
  parentId: z.string().uuid().optional(),
  observacoes: z.string().optional(),
  diagnosticoId: z.string().uuid().optional(),
});

const UpdateDelegacaoBody = z.object({
  responsavelNome: z.string().optional(),
  responsavelEmail: z.string().email().optional(),
  prazo: z.string().optional(),
  status: z.enum(["nao_delegado", "pendente", "andamento", "concluido", "atrasado"]).optional(),
  questaoInicio: z.number().int().optional(),
  questaoFim: z.number().int().optional(),
  observacoes: z.string().optional(),
});

router.get("/clinics/:clinicId/ics-status", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const [[delRow], [riskRow], [actionRow]] = await Promise.all([
    db.select({ value: count() }).from(delegacoesTable).where(eq(delegacoesTable.clinicId, clinicId)),
    db.select({ value: count() }).from(risksTable).where(eq(risksTable.clinicId, clinicId)),
    db.select({ value: count() }).from(actionsTable).where(eq(actionsTable.clinicId, clinicId)),
  ]);

  const delegacoes = delRow?.value ?? 0;
  const risks = riskRow?.value ?? 0;
  const actions = actionRow?.value ?? 0;

  res.json({
    delegacoes,
    risks,
    actions,
    seeded: delegacoes > 0 && risks > 0 && actions > 0,
  });
});

router.get("/clinics/:clinicId/delegacoes", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const delegacoes = await db
    .select()
    .from(delegacoesTable)
    .where(eq(delegacoesTable.clinicId, clinicId))
    .orderBy(delegacoesTable.nivel, delegacoesTable.createdAt);

  res.json(delegacoes.map(mapDelegacao));
});

router.post("/clinics/:clinicId/delegacoes", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const parsed = CreateDelegacaoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    pilarSlug,
    pilarNome,
    nivel,
    responsavelNome,
    responsavelEmail,
    responsavelWhatsapp,
    prazo,
    status,
    questaoInicio,
    questaoFim,
    parentId,
    observacoes,
    diagnosticoId,
  } = parsed.data;

  const [delegacao] = await db
    .insert(delegacoesTable)
    .values({
      clinicId,
      pilarSlug,
      pilarNome,
      nivel,
      responsavelNome: responsavelNome ?? null,
      responsavelEmail: responsavelEmail ?? null,
      prazo: prazo ?? null,
      status,
      questaoInicio: questaoInicio ?? null,
      questaoFim: questaoFim ?? null,
      parentId: parentId ?? null,
      observacoes: observacoes ?? null,
    })
    .returning();

  const escopoLabel = describeDelegationScope({ nivel, questaoInicio, questaoFim });

  const delegationPushPayload = {
    title: "Nova delegação criada",
    body: `${responsavelNome ?? "Responsável"} — ${pilarNome} (${escopoLabel}).`,
    url: `/delegacao/${clinicId}${diagnosticoId ? `?diagnostico=${diagnosticoId}` : ""}`,
    tag: `delegacao-${pilarSlug}`,
  };

  sendPushToClinic(clinicId, delegationPushPayload).catch(() => {});

  if (responsavelEmail) {
    sendPushToEmail(responsavelEmail, clinicId, {
      title: "Nova delegação para você",
      body: `${pilarNome} — ${escopoLabel}.`,
      url: `/delegacao/${clinicId}${diagnosticoId ? `?diagnostico=${diagnosticoId}` : ""}`,
      tag: `delegacao-${pilarSlug}`,
    }).catch(() => {});
  }

  if (responsavelEmail) {
    const recipientPrefs = await getRecipientPrefs(responsavelEmail, clinicId);

    if (recipientPrefs.whatsappEnabled || recipientPrefs.emailEnabled) {
      const [clinicRow] = await db
        .select({ nome: clinicsTable.nome })
        .from(clinicsTable)
        .where(eq(clinicsTable.id, clinicId))
        .limit(1);

      let whatsappPhone = responsavelWhatsapp;
      if (!whatsappPhone) {
        const [member] = await db
          .select({ whatsapp: teamTable.whatsapp })
          .from(teamTable)
          .where(
            and(
              eq(teamTable.clinicId, clinicId),
              sql`lower(${teamTable.email}) = lower(${responsavelEmail})`
            )
          )
          .limit(1);
        whatsappPhone = member?.whatsapp ?? undefined;
      }

      const emailAppUrl = await resolveAppUrl(req);
      const emailHtml = buildDelegationEmail({
        responsavelNome: responsavelNome ?? "Responsável",
        responsavelEmail,
        pilarNome,
        pilarSlug,
        clinicId,
        clinicName: clinicRow?.nome ?? undefined,
        diagnosticoId,
        nivel,
        questaoInicio,
        questaoFim,
        prazo: prazo ?? undefined,
        observacoes: observacoes ?? undefined,
        appUrl: emailAppUrl,
      });

      let notifiedViaWhatsApp = false;
      if (whatsappPhone && isWhatsAppConfigured() && recipientPrefs.whatsappEnabled) {
        notifiedViaWhatsApp = await sendDelegationWhatsApp({
          phone: whatsappPhone,
          responsavelNome: responsavelNome ?? "Responsável",
          pilarNome: `${pilarNome} (${escopoLabel})`,
          prazo: prazo ?? undefined,
        });
      }

      if (recipientPrefs.emailEnabled) {
        sendEmail({
          to: responsavelEmail,
          subject: `[IONEX360] Delegação — ${pilarNome} (${escopoLabel})`,
          html: emailHtml,
        }).catch(() => {});
      } else if (!notifiedViaWhatsApp) {
        // Recipient opted out of both channels — nothing to send.
      }
    }
  }

  res.status(201).json(mapDelegacao(delegacao));
});

router.patch("/delegacoes/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateDelegacaoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existingDeleg] = await db
    .select({ clinicId: delegacoesTable.clinicId })
    .from(delegacoesTable)
    .where(eq(delegacoesTable.id, id))
    .limit(1);
  if (!existingDeleg) {
    res.status(404).json({ error: "Delegation not found" });
    return;
  }
  if (await assertClinicAccess(req, res, existingDeleg.clinicId)) return;

  const updates: Partial<typeof delegacoesTable.$inferInsert> = { updatedAt: new Date() };
  const d = parsed.data;
  if (d.responsavelNome !== undefined) updates.responsavelNome = d.responsavelNome;
  if (d.responsavelEmail !== undefined) updates.responsavelEmail = d.responsavelEmail;
  if (d.prazo !== undefined) updates.prazo = d.prazo;
  if (d.status !== undefined) updates.status = d.status;
  if (d.questaoInicio !== undefined) updates.questaoInicio = d.questaoInicio;
  if (d.questaoFim !== undefined) updates.questaoFim = d.questaoFim;
  if (d.observacoes !== undefined) updates.observacoes = d.observacoes;

  const [delegacao] = await db
    .update(delegacoesTable)
    .set(updates)
    .where(eq(delegacoesTable.id, id))
    .returning();

  if (!delegacao) {
    res.status(404).json({ error: "Delegation not found" });
    return;
  }

  res.json(mapDelegacao(delegacao));
});

// ─── Respondent invite (link individual por pilar) — task #205 ──────────────
//
// Generates (or rotates) a per-delegation invite token, stores its sha256
// hash on `delegacoes`, and emails the link to the responsável. The token
// is multi-use within its TTL (30 days). Only N1 (whole pilar) delegations
// can be invited as respondents; sub-delegations (N2, faixas) reuse the
// regular plataforma flow.
router.post(
  "/clinics/:clinicId/diagnostics/:diagnosticoId/delegacoes/:delegacaoId/send-invite",
  async (req, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
    const delegacaoId = Array.isArray(req.params.delegacaoId)
      ? req.params.delegacaoId[0]
      : req.params.delegacaoId;

    const [deleg] = await db
      .select()
      .from(delegacoesTable)
      .where(and(eq(delegacoesTable.id, delegacaoId), eq(delegacoesTable.clinicId, clinicId)))
      .limit(1);
    if (!deleg) {
      res.status(404).json({ error: "Delegação não encontrada" });
      return;
    }
    if (!deleg.responsavelEmail) {
      res
        .status(400)
        .json({ error: "Adicione um e-mail de responsável antes de enviar o convite." });
      return;
    }
    if (deleg.nivel !== 1) {
      res
        .status(400)
        .json({ error: "Convites individuais só são suportados para delegações de pilar inteiro (N1)." });
      return;
    }

    const TTL_MS = 30 * 24 * 60 * 60 * 1000;
    // generateInviteCode() is fine here — same primitives as team invites.
    // We override the expiry to 30 days because respondent links must
    // survive longer (full pilar response cycle).
    const { code, hash } = generateInviteCode();
    const expiresAt = new Date(Date.now() + TTL_MS);

    await db
      .update(delegacoesTable)
      .set({
        inviteCodeHash: hash,
        inviteCodeExpiresAt: expiresAt,
        inviteSentAt: new Date(),
        inviteRedeemedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(delegacoesTable.id, deleg.id));

    const [clinic] = await db
      .select({ nome: clinicsTable.nome })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId))
      .limit(1);

    const appUrl = await resolveAppUrl(req);
    const link = `${appUrl}/responder?code=${encodeURIComponent(code)}`;
    const html = buildRespondentInviteEmail({
      responsavelNome: deleg.responsavelNome ?? "Responsável",
      pilarNome: deleg.pilarNome,
      clinicName: clinic?.nome ?? undefined,
      prazo: deleg.prazo ?? null,
      link,
    });

    const sendResult = await sendEmail({
      to: deleg.responsavelEmail,
      subject: `[IONEX360] Convite — Diagnóstico 360°: ${deleg.pilarNome}`,
      html,
    }).catch(() => false as const);

    res.json({
      ok: true,
      sent: sendResult !== false,
      to: deleg.responsavelEmail,
      expiresAt: expiresAt.toISOString(),
      link,
    });
  },
);

router.post("/clinics/:clinicId/delegacoes/seed", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const [clinic] = await db.select({ plano: clinicsTable.plano }).from(clinicsTable).where(eq(clinicsTable.id, clinicId));
  const template = await getTemplateForPlan(clinic?.plano);

  const existing = await db
    .select()
    .from(delegacoesTable)
    .where(and(eq(delegacoesTable.clinicId, clinicId), eq(delegacoesTable.nivel, 1)));

  const existingSlugs = new Set(existing.map(d => d.pilarSlug));

  const toCreate = template.pilares.filter(p => !existingSlugs.has(p.slug));

  if (toCreate.length === 0) {
    res.json({ created: 0, message: "Todos os pilares já possuem delegação N1." });
    return;
  }

  const created = await db
    .insert(delegacoesTable)
    .values(
      toCreate.map(p => ({
        clinicId,
        pilarSlug: p.slug,
        pilarNome: p.nome,
        nivel: 1,
        responsavelNome: p.role,
        responsavelEmail: null,
        prazo: null,
        status: "pendente" as const,
        questaoInicio: null,
        questaoFim: null,
        parentId: null,
        observacoes: null,
      }))
    )
    .returning();

  res.status(201).json({ created: created.length, delegacoes: created.map(mapDelegacao) });
});

router.delete("/delegacoes/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [existingDeleg] = await db
    .select({ clinicId: delegacoesTable.clinicId })
    .from(delegacoesTable)
    .where(eq(delegacoesTable.id, id))
    .limit(1);
  if (!existingDeleg) {
    res.status(404).json({ error: "Delegation not found" });
    return;
  }
  if (await assertClinicAccess(req, res, existingDeleg.clinicId)) return;

  await db.delete(delegacoesTable).where(eq(delegacoesTable.id, id));
  res.sendStatus(204);
});

export default router;
