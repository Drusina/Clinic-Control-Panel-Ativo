/**
 * Backfill / dedupe duplicate e-mails inside the same clinic on
 * `equipe_interna`, then create the partial unique index
 * `equipe_interna_clinic_email_uniq` on `(clinic_id, lower(email))
 * WHERE email IS NOT NULL` (Task #161).
 *
 * Run BEFORE deploying the schema change in production.
 * Safe to re-run — both steps are idempotent.
 *
 * Winner rule per `(clinic_id, lower(email))` group:
 *   1. row with `tem_acesso_plataforma = true` (active platform user)
 *   2. row with the most recent `last_access_at`
 *   3. row with the most recent `created_at`
 *   4. row with the largest `id` (uuid lexicographic) as final tiebreak
 *
 * Losers keep all their data but have their `email` set to NULL so the
 * unique index can be applied without losing history. Operators can then
 * manually merge or delete those records via the admin UI.
 *
 * Run with: pnpm --filter @workspace/scripts run dedupe-team-emails
 *
 * Required env:
 *   DATABASE_URL — same as API server
 *
 * Optional flags:
 *   --dry-run     — log intended changes without writing
 */
import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";

const DRY_RUN = process.argv.includes("--dry-run");

interface DupRow {
  clinic_id: string;
  email_key: string;
  ids: string[];
  noms: string[];
  acessos: boolean[];
  last_access_at: (string | null)[];
  created_at: string[];
}

async function normalizeEmptyEmails(): Promise<void> {
  // The unique index condition is `WHERE email IS NOT NULL`, so a row with
  // `email = ''` (or only whitespace) would still be indexed and trigger
  // `duplicate key value` if multiple such rows exist for the same clinic.
  // Normalize all empty/whitespace emails to NULL up front so the index
  // condition and the dedupe predicate match exactly.
  if (DRY_RUN) {
    const r = await db.execute(sql`
      SELECT count(*)::int AS c FROM equipe_interna
      WHERE email IS NOT NULL AND btrim(email) = '';
    `);
    const c = (r.rows[0] as { c: number } | undefined)?.c ?? 0;
    console.log(`  (dry-run) would set email=NULL on ${c} row(s) with empty/whitespace email`);
    return;
  }
  const r = await db.execute(sql`
    UPDATE equipe_interna SET email = NULL
    WHERE email IS NOT NULL AND btrim(email) = '';
  `);
  console.log(`  normalized ${r.rowCount ?? 0} row(s) with empty/whitespace email to NULL`);
}

async function findDuplicates(): Promise<DupRow[]> {
  const res = await db.execute(sql`
    SELECT
      clinic_id,
      lower(email) AS email_key,
      array_agg(id ORDER BY
        (tem_acesso_plataforma IS TRUE) DESC,
        last_access_at DESC NULLS LAST,
        created_at DESC,
        id DESC
      ) AS ids,
      array_agg(nome ORDER BY
        (tem_acesso_plataforma IS TRUE) DESC,
        last_access_at DESC NULLS LAST,
        created_at DESC,
        id DESC
      ) AS noms,
      array_agg(tem_acesso_plataforma ORDER BY
        (tem_acesso_plataforma IS TRUE) DESC,
        last_access_at DESC NULLS LAST,
        created_at DESC,
        id DESC
      ) AS acessos,
      array_agg(last_access_at ORDER BY
        (tem_acesso_plataforma IS TRUE) DESC,
        last_access_at DESC NULLS LAST,
        created_at DESC,
        id DESC
      ) AS last_access_at,
      array_agg(created_at ORDER BY
        (tem_acesso_plataforma IS TRUE) DESC,
        last_access_at DESC NULLS LAST,
        created_at DESC,
        id DESC
      ) AS created_at
    FROM equipe_interna
    WHERE email IS NOT NULL
    GROUP BY clinic_id, lower(email)
    HAVING count(*) > 1
    ORDER BY clinic_id, email_key;
  `);
  return res.rows as unknown as DupRow[];
}

async function dedupe(): Promise<void> {
  const groups = await findDuplicates();
  console.log(
    `\n[1/2] equipe_interna — found ${groups.length} (clinic_id, lower(email)) group(s) with duplicates`,
  );

  if (groups.length === 0) {
    console.log("  no duplicates to resolve");
    return;
  }

  for (const g of groups) {
    const [winner, ...losers] = g.ids;
    console.log(
      `  - clinic ${g.clinic_id} email "${g.email_key}": ${g.ids.length} rows`,
    );
    console.log(
      `      winner ${winner} (${g.noms[0]}, tem_acesso=${g.acessos[0]})`,
    );
    for (let i = 0; i < losers.length; i++) {
      console.log(
        `      loser  ${losers[i]} (${g.noms[i + 1]}, tem_acesso=${g.acessos[i + 1]}) → email will be set to NULL`,
      );
    }
    if (DRY_RUN) continue;

    // Null out the email on losers so the unique index can be applied.
    // We deliberately keep the rest of the data so an operator can decide
    // later whether to merge or delete.
    await db.execute(sql`
      UPDATE equipe_interna
      SET email = NULL,
          observacoes = COALESCE(observacoes, '')
            || CASE WHEN observacoes IS NULL OR observacoes = '' THEN '' ELSE E'\n' END
            || '[dedupe-task-161] e-mail original "'
            || ${g.email_key}
            || '" removido em ' || now()::text
            || ' por conflito com membro ' || ${winner} || '.'
      WHERE id = ANY(${losers}::uuid[]);
    `);
  }
}

async function ensureIndex(): Promise<void> {
  console.log(
    "\n[2/2] equipe_interna_clinic_email_uniq — ensuring partial unique index",
  );
  if (DRY_RUN) {
    console.log("  (dry-run) would CREATE UNIQUE INDEX IF NOT EXISTS");
    return;
  }
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS equipe_interna_clinic_email_uniq
      ON equipe_interna (clinic_id, lower(email))
      WHERE email IS NOT NULL;
  `);
  console.log("  ok");
}

async function main(): Promise<void> {
  if (DRY_RUN) console.log("(dry-run mode — no writes will occur)");
  console.log("\n[0/2] equipe_interna — normalizing empty/whitespace emails to NULL");
  await normalizeEmptyEmails();
  await dedupe();
  await ensureIndex();

  // Final assertion: zero duplicate groups must remain under the EXACT
  // condition used by the unique index (`email IS NOT NULL`).
  const after = await db.execute(sql`
    SELECT count(*)::int AS dups
    FROM (
      SELECT 1
      FROM equipe_interna
      WHERE email IS NOT NULL
      GROUP BY clinic_id, lower(email)
      HAVING count(*) > 1
    ) s;
  `);
  const dups = (after.rows[0] as { dups: number } | undefined)?.dups ?? 0;
  console.log(`\nPost-check: ${dups} duplicate group(s) remaining`);
  if (dups > 0 && !DRY_RUN) {
    throw new Error(
      "dedupe-team-emails: duplicates still present after backfill",
    );
  }
}

main()
  .catch((err) => {
    console.error("dedupe-team-emails failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
