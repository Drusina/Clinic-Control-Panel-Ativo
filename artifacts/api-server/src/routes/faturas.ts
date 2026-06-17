import { timingSafeEqual } from "crypto";
import { Router, type IRouter, type Request } from "express";
import { eq, sql } from "drizzle-orm";
import { db, faturasTable, clinicsTable, clinicActivityTable } from "@workspace/db";
import { assertClinicAccess, requireSuperAdmin } from "../middleware/auth";
import {
  CreateFaturaBody,
  UpdateFaturaBody,
  UpdateFaturaResponse,
  GerarFaturasDoContratoBody,
} from "@workspace/api-zod";
import { normalizeFaturaStatus } from "../lib/faturas-status.js";

const router: IRouter = Router();

function resolveActor(req: Request): string {
  const u = (req as { user?: { nome?: string; email?: string } }).user;
  return u?.nome ?? u?.email ?? "Super Admin";
}

/** Constant-time comparison for the manual super-admin release key. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Returns the due date `monthsToAdd` months after the (year, month0) start,
 * pinned to `day` and clamped to the last valid day of the resulting month.
 */
function addMonthsClampDay(
  startYear: number,
  startMonth0: number,
  monthsToAdd: number,
  day: number,
): string {
  const first = new Date(Date.UTC(startYear, startMonth0 + monthsToAdd, 1));
  const y = first.getUTCFullYear();
  const m0 = first.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  const useDay = Math.min(Math.max(day, 1), lastDay);
  return `${y}-${String(m0 + 1).padStart(2, "0")}-${String(useDay).padStart(2, "0")}`;
}

function mapFatura(f: typeof faturasTable.$inferSelect) {
  return {
    id: f.id,
    clinicId: f.clinicId,
    numero: f.numero,
    vencimento: f.vencimento,
    valor: Number(f.valor),
    status: normalizeFaturaStatus(f.status),
    pagoEm: f.pagoEm,
    formaPagamento: f.formaPagamento,
    observacao: f.observacao,
    createdAt: f.createdAt.toISOString(),
  };
}

router.get("/clinics/:clinicId/faturas", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const faturas = await db
    .select()
    .from(faturasTable)
    .where(eq(faturasTable.clinicId, clinicId))
    .orderBy(faturasTable.vencimento);

  res.json(faturas.map(mapFatura));
});

router.post("/clinics/:clinicId/faturas", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const parsed = CreateFaturaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [fatura] = await db
    .insert(faturasTable)
    .values({
      clinicId,
      numero: parsed.data.numero,
      vencimento: parsed.data.vencimento,
      valor: parsed.data.valor.toString(),
      status: parsed.data.status ?? "aberta",
      formaPagamento: parsed.data.formaPagamento ?? null,
      observacao: parsed.data.observacao ?? null,
    })
    .returning();

  res.status(201).json(mapFatura(fatura));
});

router.patch("/faturas/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateFaturaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ clinicId: faturasTable.clinicId })
    .from(faturasTable)
    .where(eq(faturasTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Fatura not found" });
    return;
  }
  if (await assertClinicAccess(req, res, existing.clinicId)) return;

  const updates: Partial<typeof faturasTable.$inferInsert> = {};
  const d = parsed.data;
  if (d.numero !== undefined) updates.numero = d.numero;
  if (d.vencimento !== undefined) updates.vencimento = d.vencimento;
  if (d.valor !== undefined) updates.valor = d.valor.toString();
  if (d.status != null) updates.status = d.status;
  if (d.pagoEm !== undefined) updates.pagoEm = d.pagoEm;
  if (d.formaPagamento !== undefined) updates.formaPagamento = d.formaPagamento;
  if (d.observacao !== undefined) updates.observacao = d.observacao;

  const [fatura] = await db.update(faturasTable).set(updates).where(eq(faturasTable.id, id)).returning();
  if (!fatura) {
    res.status(404).json({ error: "Fatura not found" });
    return;
  }

  res.json(UpdateFaturaResponse.parse(mapFatura(fatura)));
});

/**
 * Generate the invoice schedule from a clinic's commercial conditions:
 * one optional implantação (one-off) invoice + N monthly invoices, where
 * N = prazoContratoMeses. This is a controlled batch financial action: gated
 * behind `requireSuperAdmin` PLUS a manual release key (the super-admin secret)
 * and a duplicate-generation guard. Invoices start "aberta".
 */
router.post(
  "/clinics/:clinicId/faturas/gerar-do-contrato",
  requireSuperAdmin,
  async (req, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId)
      ? req.params.clinicId[0]
      : req.params.clinicId;

    const parsed = GerarFaturasDoContratoBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!parsed.data.confirmar) {
      res
        .status(400)
        .json({ error: "Confirmação explícita necessária para gerar as faturas." });
      return;
    }

    // Manual release key: the super-admin must re-enter the super-admin secret
    // to authorize this batch financial action (liberação controlada).
    const releaseSecret = process.env.SUPER_ADMIN_SECRET;
    if (!releaseSecret) {
      res.status(503).json({ error: "Super Admin não configurado no servidor." });
      return;
    }
    if (!safeEqual(parsed.data.chaveLiberacao, releaseSecret)) {
      res.status(403).json({ error: "Chave de liberação inválida." });
      return;
    }

    const [clinic] = await db
      .select()
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId))
      .limit(1);
    if (!clinic) {
      res.status(404).json({ error: "Clinic not found" });
      return;
    }

    const valorRecorrente =
      clinic.valorRecorrente != null ? Number(clinic.valorRecorrente) : null;
    const valorImplantacao =
      clinic.valorImplantacao != null ? Number(clinic.valorImplantacao) : null;
    const diaVencimento = clinic.diaVencimento;
    const prazo = clinic.prazoContratoMeses;
    const startDateStr = clinic.inicioRecorrencia ?? clinic.dataPrevistaInicio;

    const missing: string[] = [];
    if (valorRecorrente == null || valorRecorrente <= 0)
      missing.push("valor recorrente");
    if (diaVencimento == null) missing.push("dia de vencimento");
    if (prazo == null || prazo < 1) missing.push("prazo do contrato (meses)");
    if (!startDateStr)
      missing.push("início da recorrência ou data prevista de início");

    if (missing.length > 0) {
      res
        .status(400)
        .json({ error: `Condições comerciais incompletas: ${missing.join(", ")}.` });
      return;
    }

    const [startY, startM] = startDateStr!
      .split("-")
      .map((n) => parseInt(n, 10));
    const startMonth0 = startM - 1;

    const toInsert: (typeof faturasTable.$inferInsert)[] = [];

    if (valorImplantacao != null && valorImplantacao > 0) {
      toInsert.push({
        clinicId,
        numero: "IMPL",
        vencimento: startDateStr!,
        valor: valorImplantacao.toString(),
        status: "aberta",
        formaPagamento: clinic.formaPagamento ?? null,
        observacao: "Implantação",
      });
    }

    for (let i = 0; i < prazo!; i++) {
      toInsert.push({
        clinicId,
        numero: `M${String(i + 1).padStart(2, "0")}`,
        vencimento: addMonthsClampDay(startY, startMonth0, i, diaVencimento!),
        valor: valorRecorrente!.toString(),
        status: "aberta",
        formaPagamento: clinic.formaPagamento ?? null,
        observacao: `Mensalidade ${i + 1}/${prazo}`,
      });
    }

    const outcome = await db.transaction(async (tx) => {
      // Serialize concurrent generations for this clinic so a double-submit
      // cannot bypass the duplicate guard and create two invoice schedules.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`gerar-faturas:${clinicId}`}))`,
      );

      const existing = await tx
        .select({ id: faturasTable.id })
        .from(faturasTable)
        .where(eq(faturasTable.clinicId, clinicId))
        .limit(1);
      if (existing.length > 0) {
        return { conflict: true as const };
      }

      const created = await tx.insert(faturasTable).values(toInsert).returning();

      await tx.insert(clinicActivityTable).values({
        clinicId,
        tipo: "comercial",
        titulo: "Faturas geradas",
        descricao: `${created.length} fatura(s) geradas a partir das condições comerciais.`,
        autorNome: resolveActor(req),
      });

      return { conflict: false as const, created };
    });

    if (outcome.conflict) {
      res.status(409).json({
        error:
          "Já existem faturas para esta clínica. Remova as faturas existentes antes de gerar novamente.",
      });
      return;
    }

    res
      .status(201)
      .json({ criadas: outcome.created.length, faturas: outcome.created.map(mapFatura) });
  },
);

export default router;
