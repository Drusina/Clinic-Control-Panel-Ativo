import { Router, type IRouter } from "express";
import { eq, and, count, sql } from "drizzle-orm";
import { db, delegacoesTable, delegacoesPerguntasTable, perguntasTable, clinicsTable, risksTable, actionsTable, teamTable, diagnosticsTable } from "@workspace/db";
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

function mapDelegacao(d: typeof delegacoesTable.$inferSelect, perguntaIds?: string[]) {
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
    perguntaIds: perguntaIds ?? null,
    inviteSentAt: d.inviteSentAt ? d.inviteSentAt.toISOString() : null,
    inviteRedeemedAt: d.inviteRedeemedAt ? d.inviteRedeemedAt.toISOString() : null,
    inviteCodeExpiresAt: d.inviteCodeExpiresAt ? d.inviteCodeExpiresAt.toISOString() : null,
    inviteDiagnosticoId: d.inviteDiagnosticoId ?? null,
    inviteStatus: deriveInviteStatus(d),
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

function deriveInviteStatus(d: typeof delegacoesTable.$inferSelect):
  | "nao_enviado"
  | "enviado"
  | "aceito"
  | "expirado" {
  if (!d.inviteCodeHash || !d.inviteSentAt) return "nao_enviado";
  // Redemption wins over expiry — once accepted, the invite stays "aceito"
  // even after the code's TTL has lapsed (the JWT keeps working until its
  // own expiry).
  if (d.inviteRedeemedAt) return "aceito";
  if (d.inviteCodeExpiresAt && d.inviteCodeExpiresAt < new Date()) return "expirado";
  return "enviado";
}

// Helper: aceita string, null e undefined nos campos opcionais. Strings vazias
// e nulls são normalizados para `undefined` para que o INSERT use NULL via
// `?? null` e o resto da lógica trate "campo em branco" uniformemente.
const optionalString = () =>
  z
    .string()
    .nullish()
    .transform((v) => (v == null || v === "" ? undefined : v));

const optionalEmail = () =>
  z
    .string()
    .nullish()
    .transform((v) => (v == null || v === "" ? undefined : v))
    .refine((v) => v === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "E-mail inválido.",
    });

const optionalUuid = () =>
  z
    .string()
    .nullish()
    .transform((v) => (v == null || v === "" ? undefined : v))
    .refine((v) => v === undefined || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v), {
      message: "UUID inválido.",
    });

const CreateDelegacaoBody = z.object({
  pilarSlug: z.string(),
  pilarNome: z.string(),
  nivel: z.number().int().min(1).max(3).optional().default(1),
  responsavelNome: optionalString(),
  responsavelEmail: optionalEmail(),
  responsavelWhatsapp: optionalString(),
  prazo: optionalString(),
  status: z.enum(["nao_delegado", "pendente", "andamento", "concluido", "atrasado"]).optional().default("pendente"),
  questaoInicio: z.number().int().nullish().transform((v) => v ?? undefined),
  questaoFim: z.number().int().nullish().transform((v) => v ?? undefined),
  parentId: optionalUuid(),
  observacoes: optionalString(),
  diagnosticoId: optionalUuid(),
  // Nível 3: perguntas individuais ad-hoc (lote ou unitária)
  perguntaIds: z.array(z.string().uuid()).nullish().transform((v) => v ?? undefined),
  // Quando true, gera invite code e dispara e-mail imediatamente.
  enviarConvite: z.boolean().optional().default(false),
});

const UpdateDelegacaoBody = z.object({
  responsavelNome: optionalString(),
  responsavelEmail: optionalEmail(),
  prazo: optionalString(),
  status: z.enum(["nao_delegado", "pendente", "andamento", "concluido", "atrasado"]).optional(),
  questaoInicio: z.number().int().nullish().transform((v) => v ?? undefined),
  questaoFim: z.number().int().nullish().transform((v) => v ?? undefined),
  observacoes: optionalString(),
});

function formatZodError(err: z.ZodError): string {
  const first = err.issues[0];
  if (!first) return "Dados inválidos.";
  const path = first.path.length > 0 ? `${first.path.join(".")}: ` : "";
  return `${path}${first.message}`;
}

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

  // Hidrata perguntaIds para QUALQUER delegação ad-hoc (qualquer nivel >= 3,
  // incluindo sub-delegações profundas — cadeia indefinida).
  const n3Ids = delegacoes.filter((d) => d.nivel >= 3).map((d) => d.id);
  const perguntasByDeleg = new Map<string, string[]>();
  if (n3Ids.length > 0) {
    const links = await db
      .select()
      .from(delegacoesPerguntasTable)
      .where(sql`${delegacoesPerguntasTable.delegacaoId} = ANY(${n3Ids})`);
    for (const l of links) {
      const arr = perguntasByDeleg.get(l.delegacaoId) ?? [];
      arr.push(l.perguntaId);
      perguntasByDeleg.set(l.delegacaoId, arr);
    }
  }

  res.json(delegacoes.map((d) => mapDelegacao(d, perguntasByDeleg.get(d.id))));
});

router.post("/clinics/:clinicId/delegacoes", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const parsed = CreateDelegacaoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
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
    perguntaIds,
    enviarConvite,
  } = parsed.data;

  // Para nível 3 (perguntas ad-hoc), perguntaIds é obrigatório.
  if (nivel === 3 && (!perguntaIds || perguntaIds.length === 0)) {
    res.status(400).json({ error: "Nível 3 requer perguntaIds com pelo menos uma pergunta." });
    return;
  }

  // Valida que todas as perguntas existem. Cross-pilar é permitido — quando o
  // batch toca mais de um pilar, o registro fica com pilarSlug="misto" e
  // pilarNome descritivo ("N perguntas em M pilares").
  let resolvedPerguntaIds: string[] | undefined;
  let effectivePilarSlug = pilarSlug;
  let effectivePilarNome = pilarNome;
  if (nivel === 3 && perguntaIds && perguntaIds.length > 0) {
    const found = await db
      .select({ id: perguntasTable.id, pilarSlug: perguntasTable.pilarSlug, pilarNome: perguntasTable.pilarNome })
      .from(perguntasTable)
      .where(sql`${perguntasTable.id} = ANY(${perguntaIds})`);
    if (found.length !== perguntaIds.length) {
      res.status(400).json({ error: "Uma ou mais perguntas não existem." });
      return;
    }
    const distinctPilars = Array.from(new Set(found.map((p) => p.pilarSlug)));
    if (distinctPilars.length > 1) {
      effectivePilarSlug = "misto";
      effectivePilarNome = `${found.length} perguntas em ${distinctPilars.length} pilares`;
    } else {
      effectivePilarSlug = distinctPilars[0];
      effectivePilarNome = found[0].pilarNome;
    }
    resolvedPerguntaIds = found.map((p) => p.id);
  }

  const [delegacao] = await db
    .insert(delegacoesTable)
    .values({
      clinicId,
      pilarSlug: effectivePilarSlug,
      pilarNome: effectivePilarNome,
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

  if (resolvedPerguntaIds && resolvedPerguntaIds.length > 0) {
    await db.insert(delegacoesPerguntasTable).values(
      resolvedPerguntaIds.map((pid) => ({ delegacaoId: delegacao.id, perguntaId: pid })),
    );
  }

  // Se enviarConvite=true e tiver e-mail + diagnostico, gera invite imediatamente.
  let inviteLink: string | null = null;
  if (enviarConvite && responsavelEmail && diagnosticoId) {
    try {
      const TTL_MS = 30 * 24 * 60 * 60 * 1000;
      const { code, hash } = generateInviteCode();
      const expiresAt = new Date(Date.now() + TTL_MS);
      await db
        .update(delegacoesTable)
        .set({
          inviteCodeHash: hash,
          inviteCodeExpiresAt: expiresAt,
          inviteSentAt: new Date(),
          inviteRedeemedAt: null,
          inviteDiagnosticoId: diagnosticoId,
          updatedAt: new Date(),
        })
        .where(eq(delegacoesTable.id, delegacao.id));
      const appUrl = await resolveAppUrl(req);
      inviteLink = `${appUrl}/responder?code=${encodeURIComponent(code)}`;
      const [clinicRow] = await db
        .select({ nome: clinicsTable.nome })
        .from(clinicsTable)
        .where(eq(clinicsTable.id, clinicId))
        .limit(1);
      const html = buildRespondentInviteEmail({
        responsavelNome: responsavelNome ?? "Responsável",
        pilarNome,
        clinicName: clinicRow?.nome ?? undefined,
        prazo: prazo ?? null,
        link: inviteLink,
      });
      sendEmail({
        to: responsavelEmail,
        subject: `[IONEX360] Convite — Diagnóstico 360°: ${pilarNome}`,
        html,
      }).catch(() => {});
    } catch (err) {
      req.log?.error({ err }, "Falha ao auto-enviar convite de delegação");
    }
  }

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

  // Re-read after potential invite update to get fresh invite columns.
  const [final] = await db
    .select()
    .from(delegacoesTable)
    .where(eq(delegacoesTable.id, delegacao.id))
    .limit(1);
  const out = mapDelegacao(final ?? delegacao, resolvedPerguntaIds);
  res.status(201).json(inviteLink ? { ...out, inviteLink } : out);
});

router.patch("/delegacoes/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateDelegacaoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
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
    const diagnosticoId = Array.isArray(req.params.diagnosticoId)
      ? req.params.diagnosticoId[0]
      : req.params.diagnosticoId;
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
    if (deleg.nivel !== 1 && deleg.nivel !== 3) {
      res
        .status(400)
        .json({ error: "Convites individuais só são suportados para delegações de pilar (N1) ou perguntas ad-hoc (N3)." });
      return;
    }

    // Validate the diagnostic exists, belongs to this clinic, and is still
    // open. Sending a link bound to a non-existent / cross-clinic / already-
    // concluded diagnostic would generate a token that fails on first use.
    const [diag] = await db
      .select({ id: diagnosticsTable.id, status: diagnosticsTable.status })
      .from(diagnosticsTable)
      .where(and(eq(diagnosticsTable.id, diagnosticoId), eq(diagnosticsTable.clinicId, clinicId)))
      .limit(1);
    if (!diag) {
      res.status(404).json({ error: "Diagnóstico não encontrado nesta clínica." });
      return;
    }
    if (diag.status === "concluido") {
      res
        .status(409)
        .json({ error: "Diagnóstico já concluído — não é possível enviar novos convites." });
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
        inviteDiagnosticoId: diagnosticoId,
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

  res.status(201).json({ created: created.length, delegacoes: created.map((d) => mapDelegacao(d)) });
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
