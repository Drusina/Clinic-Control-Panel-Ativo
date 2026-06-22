import { and, desc, eq, sql } from "drizzle-orm";
import { db, diagnosticsTable } from "@workspace/db";
import { PILAR_NOMES } from "./risk-generator.js";

/**
 * The diagnostic "origin" of an action: how the action's pillar performed in the
 * clinic's latest concluded diagnostic. Computed live from the stored per-pillar
 * scores — no schema column, no snapshot.
 */
export type OrigemDiagnostico = {
  pilarSlug: string;
  pilarNome: string;
  score: number;
  meta: number;
  abaixoDaMeta: boolean;
};

/** Default per-pillar target when a diagnostic did not store an explicit meta. */
const DEFAULT_META = 4;

/**
 * Load the clinic's latest CONCLUDED diagnostic and build a `pilarSlug → {score, meta}`
 * map from its stored per-pillar scores. Returns an EMPTY map when the clinic has no
 * concluded diagnostic, so callers can treat "no origin" uniformly.
 */
export async function loadPilarScores(
  clinicId: string,
): Promise<Map<string, { score: number; meta: number }>> {
  const [diag] = await db
    .select({
      scoresPilares: diagnosticsTable.scoresPilares,
      metasPilares: diagnosticsTable.metasPilares,
    })
    .from(diagnosticsTable)
    .where(
      and(eq(diagnosticsTable.clinicId, clinicId), eq(diagnosticsTable.status, "concluido")),
    )
    .orderBy(sql`${diagnosticsTable.concluidoEm} DESC NULLS LAST`, desc(diagnosticsTable.createdAt))
    .limit(1);

  const map = new Map<string, { score: number; meta: number }>();
  if (!diag) return map;

  const scores = (diag.scoresPilares ?? {}) as Record<string, unknown>;
  const metas = (diag.metasPilares ?? {}) as Record<string, unknown>;
  for (const [slug, rawScore] of Object.entries(scores)) {
    const score = Number(rawScore);
    if (!Number.isFinite(score)) continue;
    const rawMeta = Number(metas[slug]);
    const meta = Number.isFinite(rawMeta) ? rawMeta : DEFAULT_META;
    map.set(slug, { score, meta });
  }
  return map;
}

/**
 * Resolve the diagnostic origin for a single action's pillar against a previously
 * loaded score map. Returns null when the action has no pillar, or the pillar has
 * no score in the latest concluded diagnostic.
 */
export function buildOrigemDiagnostico(
  pilarSlug: string | null | undefined,
  scores: Map<string, { score: number; meta: number }>,
): OrigemDiagnostico | null {
  if (!pilarSlug) return null;
  const entry = scores.get(pilarSlug);
  if (!entry) return null;
  return {
    pilarSlug,
    pilarNome: PILAR_NOMES[pilarSlug] ?? pilarSlug,
    score: entry.score,
    meta: entry.meta,
    abaixoDaMeta: entry.score < entry.meta,
  };
}
