import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, delegacoesTable } from "@workspace/db";
import { z } from "zod";
import { sendEmail, buildDelegationEmail } from "../lib/email.js";
import { sendDelegationWhatsApp, isWhatsAppConfigured } from "../lib/whatsapp.js";
import { getRecipientPrefs } from "../lib/preferences.js";
import { sendPushToClinic } from "../lib/push.js";

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
  prazo: z.string().optional(),
  status: z.enum(["nao_delegado", "pendente", "andamento", "concluido", "atrasado"]).optional().default("pendente"),
  questaoInicio: z.number().int().optional(),
  questaoFim: z.number().int().optional(),
  parentId: z.string().uuid().optional(),
  observacoes: z.string().optional(),
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

  const { pilarSlug, pilarNome, nivel, responsavelNome, responsavelEmail, prazo, status, questaoInicio, questaoFim, parentId, observacoes } = parsed.data;

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

  const delegationPushPayload = {
    title: "Nova delegação criada",
    body: `${responsavelNome ?? "Responsável"} — pilar "${pilarNome}".`,
    url: `/delegacao/select`,
    tag: `delegacao-${pilarSlug}`,
  };

  sendPushToClinic(clinicId, delegationPushPayload).catch(() => {});

  if (responsavelEmail) {
    const recipientPrefs = await getRecipientPrefs(responsavelEmail);

    if (recipientPrefs.whatsappEnabled || recipientPrefs.emailEnabled) {
      const emailHtml = buildDelegationEmail({
        responsavelNome: responsavelNome ?? "Responsável",
        responsavelEmail,
        pilarNome,
        pilarSlug,
        prazo: prazo ?? undefined,
        observacoes: observacoes ?? undefined,
      });

      const whatsappPhone = req.body?.responsavelWhatsapp as string | undefined;
      let notifiedViaWhatsApp = false;

      if (whatsappPhone && isWhatsAppConfigured() && recipientPrefs.whatsappEnabled) {
        notifiedViaWhatsApp = await sendDelegationWhatsApp({
          phone: whatsappPhone,
          responsavelNome: responsavelNome ?? "Responsável",
          pilarNome,
          prazo: prazo ?? undefined,
        });
      }

      if (!notifiedViaWhatsApp && recipientPrefs.emailEnabled) {
        sendEmail({
          to: responsavelEmail,
          subject: `[IONEX360] Delegação — você é responsável pelo pilar ${pilarNome}`,
          html: emailHtml,
        }).catch(() => {});
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

const ICS_PILARES = [
  { slug: "estrategia", nome: "Estratégia e Governança", role: "CEO / Gestor Principal" },
  { slug: "financeiro", nome: "Financeiro e Fluxo de Caixa", role: "Gestor Financeiro" },
  { slug: "contabil", nome: "Contabilidade e Fiscal", role: "Contador Responsável" },
  { slug: "marketing", nome: "Vendas, Marketing e Captação", role: "Gestor de Marketing" },
  { slug: "operacoes", nome: "Processos Operacionais", role: "Coordenador Operacional" },
  { slug: "pessoas", nome: "Gestão de Pessoas e Cultura", role: "Gestor de Pessoas" },
  { slug: "tecnologia", nome: "Tecnologia e Sistemas", role: "Responsável de TI" },
];

router.post("/clinics/:clinicId/delegacoes/seed", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const existing = await db
    .select()
    .from(delegacoesTable)
    .where(and(eq(delegacoesTable.clinicId, clinicId), eq(delegacoesTable.nivel, 1)));

  const existingSlugs = new Set(existing.map(d => d.pilarSlug));

  const toCreate = ICS_PILARES.filter(p => !existingSlugs.has(p.slug));

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

  const [delegacao] = await db
    .delete(delegacoesTable)
    .where(eq(delegacoesTable.id, id))
    .returning();

  if (!delegacao) {
    res.status(404).json({ error: "Delegation not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
