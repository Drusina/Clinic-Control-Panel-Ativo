#!/usr/bin/env node
/**
 * Idempotent backfill: copy legacy single-file uploads from
 * docs_constitutivos.storage_path into the new docs_constitutivos_files table
 * as sequence_number=1, preserving size/date/name where possible.
 *
 * Safe to run multiple times: only inserts rows for legacy docs that don't
 * already have a corresponding child file row.
 *
 * Usage: node artifacts/api-server/src/scripts/backfill-docs-constitutivos-files.mjs
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

// Resolve the workspace's pg dependency (installed under lib/db/node_modules)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireFromDb = createRequire(path.resolve(__dirname, "../../../../lib/db/package.json"));
const pg = requireFromDb("pg");
const { Pool } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  try {
    const result = await pool.query(`
      INSERT INTO docs_constitutivos_files
        (doc_id, storage_path, file_name, tamanho, sequence_number, enviado_em)
      SELECT
        id,
        storage_path,
        COALESCE(nome, 'arquivo.pdf'),
        tamanho,
        1,
        COALESCE(enviado_em, NOW())
      FROM docs_constitutivos
      WHERE storage_path IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM docs_constitutivos_files
          WHERE doc_id = docs_constitutivos.id
        )
      RETURNING id, doc_id, file_name
    `);
    console.log(`Backfilled ${result.rowCount} legacy doc file(s).`);
    if (result.rowCount > 0) {
      console.table(result.rows);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
