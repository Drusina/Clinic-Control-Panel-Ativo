import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/** Canonical fatura statuses (matches the OpenAPI Fatura.status enum). */
export const FATURA_STATUSES = [
  "aberta",
  "enviada",
  "paga",
  "vencida",
  "cancelada",
] as const;

const VALID = new Set<string>(FATURA_STATUSES);

/** Legacy → canonical status mapping (pre-Central-Comercial vocabulary). */
const LEGACY_MAP: Record<string, string> = {
  pendente: "aberta",
  pago: "paga",
  atrasado: "vencida",
  cancelado: "cancelada",
};

/**
 * Coerce any persisted status into a canonical enum value so API responses
 * (which are Zod-parsed against the canonical enum) never fail on legacy rows.
 */
export function normalizeFaturaStatus(raw: string | null | undefined): string {
  if (raw && VALID.has(raw)) return raw;
  if (raw && LEGACY_MAP[raw]) return LEGACY_MAP[raw];
  return "aberta";
}

/**
 * One-time, idempotent data migration: rewrites legacy fatura statuses
 * (pendente/pago/atrasado/cancelado) to the canonical vocabulary. Safe to run
 * on every boot — it only touches rows whose status is still legacy.
 */
export async function normalizeLegacyFaturaStatuses(): Promise<number> {
  const result = await db.execute(sql`
    UPDATE faturas SET status = CASE status
      WHEN 'pendente' THEN 'aberta'
      WHEN 'pago' THEN 'paga'
      WHEN 'atrasado' THEN 'vencida'
      WHEN 'cancelado' THEN 'cancelada'
      ELSE status
    END
    WHERE status IN ('pendente', 'pago', 'atrasado', 'cancelado')
  `);
  return (result as { rowCount?: number }).rowCount ?? 0;
}
