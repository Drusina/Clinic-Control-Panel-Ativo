import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, icsPlanTemplatesTable } from "@workspace/db";
import { ICS_RISKS, ICS_ACTIONS, ICS_PILARES } from "../lib/ics-seed";

const router = Router();

const VALID_PLANS = ["starter", "pro", "enterprise"] as const;
type Plan = (typeof VALID_PLANS)[number];

const IcsRiskSchema = z.object({
  nome: z.string().min(1),
  descricao: z.string().min(1),
  probabilidade: z.number().int().min(1).max(5),
  impacto: z.number().int().min(1).max(5),
  pilarSlug: z.string().min(1),
  acoesMitigadoras: z.string(),
});

const IcsActionSchema = z.object({
  titulo: z.string().min(1),
  descricao: z.string().min(1),
  pilarSlug: z.string().min(1),
  prioridade: z.enum(["alta", "media", "baixa"]),
  coluna: z.enum(["backlog", "todo", "doing", "review", "done"]),
  ordem: z.number().int().min(1),
  // Títulos de tarefas sugeridas criadas junto com a ação no seed (somente
  // títulos; sem responsável/datas/status). Opcional p/ compat com templates
  // antigos sem tarefas.
  tarefas: z.array(z.string()).optional(),
});

const IcsPilarSchema = z.object({
  slug: z.string().min(1),
  nome: z.string().min(1),
  role: z.string().min(1),
});

const PutTemplateBody = z.object({
  risks: z.array(IcsRiskSchema).optional(),
  actions: z.array(IcsActionSchema).optional(),
  pilares: z.array(IcsPilarSchema).optional(),
});

function isValidPlan(plan: string): plan is Plan {
  return VALID_PLANS.includes(plan as Plan);
}

function parseJsonField<T>(raw: string | null | undefined, fallback: T[]): T[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

router.get("/admin/ics-templates", async (_req, res): Promise<void> => {
  const rows = await db.select().from(icsPlanTemplatesTable);

  const result = VALID_PLANS.map((plan) => {
    const row = rows.find((r) => r.plan === plan);
    return {
      plan,
      risks: parseJsonField(row?.risks, ICS_RISKS),
      actions: parseJsonField(row?.actions, ICS_ACTIONS),
      pilares: parseJsonField(row?.pilares, ICS_PILARES),
      isCustomized: !!row,
      updatedAt: row?.updatedAt ?? null,
    };
  });

  res.json(result);
});

router.get("/admin/ics-templates/:plan", async (req, res): Promise<void> => {
  const plan = req.params.plan;
  if (!isValidPlan(plan)) {
    res.status(400).json({ error: "Plano inválido. Use: starter, pro ou enterprise." });
    return;
  }

  const [row] = await db.select().from(icsPlanTemplatesTable).where(eq(icsPlanTemplatesTable.plan, plan));

  res.json({
    plan,
    risks: parseJsonField(row?.risks, ICS_RISKS),
    actions: parseJsonField(row?.actions, ICS_ACTIONS),
    pilares: parseJsonField(row?.pilares, ICS_PILARES),
    isCustomized: !!row,
    updatedAt: row?.updatedAt ?? null,
    defaults: {
      risks: ICS_RISKS,
      actions: ICS_ACTIONS,
      pilares: ICS_PILARES,
    },
  });
});

router.put("/admin/ics-templates/:plan", async (req, res): Promise<void> => {
  const plan = req.params.plan;
  if (!isValidPlan(plan)) {
    res.status(400).json({ error: "Plano inválido. Use: starter, pro ou enterprise." });
    return;
  }

  const parsed = PutTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Payload inválido.", details: parsed.error.flatten() });
    return;
  }

  const { risks, actions, pilares } = parsed.data;
  const now = new Date();

  const [existing] = await db.select().from(icsPlanTemplatesTable).where(eq(icsPlanTemplatesTable.plan, plan));

  if (existing) {
    const [updated] = await db
      .update(icsPlanTemplatesTable)
      .set({
        risks: risks !== undefined ? JSON.stringify(risks) : existing.risks,
        actions: actions !== undefined ? JSON.stringify(actions) : existing.actions,
        pilares: pilares !== undefined ? JSON.stringify(pilares) : existing.pilares,
        updatedAt: now,
      })
      .where(eq(icsPlanTemplatesTable.plan, plan))
      .returning();

    res.json({
      plan: updated.plan,
      risks: parseJsonField(updated.risks, ICS_RISKS),
      actions: parseJsonField(updated.actions, ICS_ACTIONS),
      pilares: parseJsonField(updated.pilares, ICS_PILARES),
      isCustomized: true,
      updatedAt: updated.updatedAt,
    });
  } else {
    const [created] = await db
      .insert(icsPlanTemplatesTable)
      .values({
        plan,
        risks: risks !== undefined ? JSON.stringify(risks) : null,
        actions: actions !== undefined ? JSON.stringify(actions) : null,
        pilares: pilares !== undefined ? JSON.stringify(pilares) : null,
        updatedAt: now,
      })
      .returning();

    res.status(201).json({
      plan: created.plan,
      risks: parseJsonField(created.risks, ICS_RISKS),
      actions: parseJsonField(created.actions, ICS_ACTIONS),
      pilares: parseJsonField(created.pilares, ICS_PILARES),
      isCustomized: true,
      updatedAt: created.updatedAt,
    });
  }
});

router.delete("/admin/ics-templates/:plan", async (req, res): Promise<void> => {
  const plan = req.params.plan;
  if (!isValidPlan(plan)) {
    res.status(400).json({ error: "Plano inválido. Use: starter, pro ou enterprise." });
    return;
  }

  await db.delete(icsPlanTemplatesTable).where(eq(icsPlanTemplatesTable.plan, plan));

  res.json({
    plan,
    risks: ICS_RISKS,
    actions: ICS_ACTIONS,
    pilares: ICS_PILARES,
    isCustomized: false,
    updatedAt: null,
    message: "Template redefinido para os padrões ICS.",
  });
});

export default router;
