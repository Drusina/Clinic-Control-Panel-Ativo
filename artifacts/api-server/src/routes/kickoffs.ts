import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, kickoffsTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

// ─── Body validation / normalization ───────────────────────────────────────
//
// O formulário do "Resumo do Kickoff" (e o módulo completo de Kick-off)
// inicializa campos opcionais como string vazia (ex.: dataRealizacao="").
// O operador `??` NÃO converte "" em null, então uma string vazia chegava à
// coluna Postgres `date`/`integer` e estourava o upsert inteiro com HTTP 500 —
// derrubando junto a Modalidade e o Status que o usuário acabara de escolher.
// Aqui normalizamos "" → null ANTES de tocar o banco e validamos a entrada,
// devolvendo 400 (não 500) em caso de formato inválido.

// Valida formato AAAA-MM-DD E validade de calendário (rejeita 2026-99-99,
// 2026-02-30 etc.) para que datas impossíveis devolvam 400 em vez de 500.
function isValidIsoDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

// "" / null / ausente → null; "2026-04-27T00:00:00" → "2026-04-27".
const optionalDate = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v.slice(0, 10)))
  .refine((v) => v == null || isValidIsoDate(v), {
    message: "Data inválida (use o formato AAAA-MM-DD).",
  });

// "" / null / ausente → null; qualquer outra string passa adiante.
const optionalText = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v));

// Aceita número ou string numérica; "" / null / NaN → null; demais → inteiro.
const optionalInt = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => {
    if (v == null || (typeof v === "string" && v.trim() === "")) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  });

const proximoPassoSchema = z.object({
  acao: z.string(),
  responsavel: z.string(),
  prazo: z.string(),
});

const UpsertKickoffBody = z.object({
  dataRealizacao: optionalDate.optional(),
  modalidade: optionalText.optional(),
  duracaoMinutos: optionalInt.optional(),
  facilitador: optionalText.optional(),
  participantes: z.array(z.string()).nullish(),
  pauta: z.array(z.string()).nullish(),
  proximosPassos: z.array(proximoPassoSchema).nullish(),
  // "" / null / ausente → undefined, para cair no default/valor existente.
  status: z
    .union([z.enum(["rascunho", "realizado", "validado"]), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v == null || v === "" ? undefined : v)),
});

function formatZodError(err: z.ZodError): string {
  const first = err.issues[0];
  if (!first) return "Dados inválidos.";
  const path = first.path.length > 0 ? `${first.path.join(".")}: ` : "";
  return `${path}${first.message}`;
}

function mapKickoff(k: typeof kickoffsTable.$inferSelect) {
  return {
    id: k.id,
    clinicId: k.clinicId,
    dataRealizacao: k.dataRealizacao,
    modalidade: k.modalidade,
    duracaoMinutos: k.duracaoMinutos,
    facilitador: k.facilitador,
    participantes: (k.participantes as string[]) ?? [],
    pauta: k.pauta ?? [],
    proximosPassos: (k.proximosPassos as Array<{ acao: string; responsavel: string; prazo: string }>) ?? [],
    status: k.status,
    createdAt: k.createdAt.toISOString(),
    updatedAt: k.updatedAt.toISOString(),
  };
}

router.get("/clinics/:clinicId/kickoff", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const [kickoff] = await db.select().from(kickoffsTable).where(eq(kickoffsTable.clinicId, clinicId));
  if (!kickoff) {
    res.status(404).json({ error: "Kickoff not found" });
    return;
  }

  res.json(mapKickoff(kickoff));
});

router.put("/clinics/:clinicId/kickoff", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const parsed = UpsertKickoffBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  const d = parsed.data;

  const existing = await db.select().from(kickoffsTable).where(eq(kickoffsTable.clinicId, clinicId));

  if (existing.length > 0) {
    const [kickoff] = await db
      .update(kickoffsTable)
      .set({
        dataRealizacao: d.dataRealizacao ?? null,
        modalidade: d.modalidade ?? null,
        duracaoMinutos: d.duracaoMinutos ?? null,
        facilitador: d.facilitador ?? null,
        participantes: d.participantes ?? existing[0].participantes,
        pauta: d.pauta ?? existing[0].pauta,
        proximosPassos: d.proximosPassos ?? existing[0].proximosPassos,
        status: d.status ?? existing[0].status,
        updatedAt: new Date(),
      })
      .where(eq(kickoffsTable.clinicId, clinicId))
      .returning();

    res.json(mapKickoff(kickoff));
  } else {
    const [kickoff] = await db
      .insert(kickoffsTable)
      .values({
        clinicId,
        dataRealizacao: d.dataRealizacao ?? null,
        modalidade: d.modalidade ?? null,
        duracaoMinutos: d.duracaoMinutos ?? null,
        facilitador: d.facilitador ?? null,
        participantes: d.participantes ?? [],
        pauta: d.pauta ?? [],
        proximosPassos: d.proximosPassos ?? [],
        status: d.status ?? "rascunho",
      })
      .returning();

    res.json(mapKickoff(kickoff));
  }
});

export default router;
