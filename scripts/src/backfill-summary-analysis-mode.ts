/**
 * Backfill `summary_analysis_mode` on clinic_documents and `_analysis_mode`
 * on societary_extractions for rows summarized/extracted before the badge
 * tracking was added (Task #155).
 *
 * Heuristic — for each affected row we try to read the underlying file from
 * object storage and probe it with pdf-parse:
 *   - text/* mime → 'text'
 *   - application/pdf with extractable text → 'text'
 *   - application/pdf with no text layer / empty / parse error → 'vision'
 *   - other / unreadable → leave NULL and log
 *
 * Run with: pnpm --filter @workspace/scripts run backfill-summary-analysis-mode
 *
 * Required env:
 *   DATABASE_URL          — same as API server
 *   PRIVATE_OBJECT_DIR    — same as API server (e.g. /bucket-name/.private)
 *
 * Optional flags:
 *   --dry-run             — log intended updates without writing
 *   --limit=N             — only process the first N candidates per table
 */
import { Storage, type File } from "@google-cloud/storage";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";
import {
  db,
  pool,
  clinicDocumentsTable,
  societaryExtractionsTable,
} from "@workspace/db";

type AnalysisMode = "text" | "vision";

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = (() => {
  const arg = process.argv.find((a) => a.startsWith("--limit="));
  if (!arg) return null;
  const n = Number(arg.slice("--limit=".length));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
})();

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) {
    throw new Error("PRIVATE_OBJECT_DIR is required to download files.");
  }
  return dir;
}

function resolveObjectFile(storagePath: string): File | null {
  if (!storagePath || !storagePath.startsWith("/objects/")) return null;
  const parts = storagePath.slice(1).split("/");
  if (parts.length < 2) return null;
  const entityId = parts.slice(1).join("/");
  let entityDir = getPrivateObjectDir();
  if (!entityDir.endsWith("/")) entityDir = `${entityDir}/`;
  const fullPath = `${entityDir}${entityId}`;
  const normalized = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
  const segments = normalized.split("/");
  if (segments.length < 3) return null;
  const bucketName = segments[1];
  const objectName = segments.slice(2).join("/");
  return storage.bucket(bucketName).file(objectName);
}

interface ProbeResult {
  mode: AnalysisMode;
  totalPages: number | null;
}

async function probeFile(
  storagePath: string,
  mimeType: string | null,
): Promise<ProbeResult | null> {
  if (mimeType && mimeType.startsWith("text/")) {
    return { mode: "text", totalPages: null };
  }
  if (mimeType !== "application/pdf") {
    return null;
  }

  const file = resolveObjectFile(storagePath);
  if (!file) return null;

  try {
    const [exists] = await file.exists();
    if (!exists) return null;
  } catch {
    return null;
  }

  let buffer: Buffer;
  try {
    const [data] = await file.download();
    buffer = data;
  } catch (err) {
    console.warn(
      `  download failed for ${storagePath}: ${(err as Error).message}`,
    );
    return null;
  }

  try {
    const parsed = await pdfParse(buffer);
    const text = (parsed.text ?? "").trim();
    const totalPages =
      typeof parsed.numpages === "number" && parsed.numpages > 0
        ? parsed.numpages
        : null;
    if (text.length > 0) {
      return { mode: "text", totalPages: null };
    }
    return { mode: "vision", totalPages };
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (/password|encrypt/i.test(msg)) {
      console.warn(`  encrypted PDF, leaving NULL: ${storagePath}`);
      return null;
    }
    return { mode: "vision", totalPages: null };
  }
}

interface Stats {
  scanned: number;
  textBackfilled: number;
  visionBackfilled: number;
  skipped: number;
}

async function backfillClinicDocuments(): Promise<Stats> {
  console.log("\n[1/2] clinic_documents — scanning rows missing analysis mode…");
  const baseQuery = db
    .select({
      id: clinicDocumentsTable.id,
      storagePath: clinicDocumentsTable.storagePath,
      fileType: clinicDocumentsTable.fileType,
      summaryTotalPages: clinicDocumentsTable.summaryTotalPages,
    })
    .from(clinicDocumentsTable)
    .where(
      and(
        isNotNull(clinicDocumentsTable.summary),
        isNull(clinicDocumentsTable.summaryAnalysisMode),
      ),
    );

  const rows = LIMIT ? await baseQuery.limit(LIMIT) : await baseQuery;
  console.log(`  found ${rows.length} candidate(s)`);

  const stats: Stats = {
    scanned: rows.length,
    textBackfilled: 0,
    visionBackfilled: 0,
    skipped: 0,
  };

  for (const row of rows) {
    const probe = await probeFile(row.storagePath, row.fileType);
    if (!probe) {
      stats.skipped++;
      console.log(
        `  - ${row.id} (${row.fileType ?? "unknown"}): unable to probe, leaving NULL`,
      );
      continue;
    }

    if (probe.mode === "text") stats.textBackfilled++;
    else stats.visionBackfilled++;

    console.log(
      `  - ${row.id} (${row.fileType ?? "unknown"}): ${probe.mode}` +
        (probe.totalPages ? ` (${probe.totalPages} pages)` : ""),
    );

    if (DRY_RUN) continue;

    const updates: {
      summaryAnalysisMode: AnalysisMode;
      summaryTotalPages?: number;
    } = { summaryAnalysisMode: probe.mode };
    if (probe.mode === "vision" && probe.totalPages && !row.summaryTotalPages) {
      updates.summaryTotalPages = probe.totalPages;
    }

    await db
      .update(clinicDocumentsTable)
      .set(updates)
      .where(eq(clinicDocumentsTable.id, row.id));
  }

  return stats;
}

async function backfillSocietaryExtractions(): Promise<Stats> {
  console.log(
    "\n[2/2] societary_extractions — scanning rows missing _analysis_mode…",
  );

  const baseQuery = db
    .select({
      id: societaryExtractionsTable.id,
      extraction: societaryExtractionsTable.extraction,
      storagePath: clinicDocumentsTable.storagePath,
      fileType: clinicDocumentsTable.fileType,
    })
    .from(societaryExtractionsTable)
    .innerJoin(
      clinicDocumentsTable,
      eq(societaryExtractionsTable.documentId, clinicDocumentsTable.id),
    )
    .where(
      sql`(${societaryExtractionsTable.extraction} ->> '_analysis_mode') IS NULL`,
    );

  const rows = LIMIT ? await baseQuery.limit(LIMIT) : await baseQuery;
  console.log(`  found ${rows.length} candidate(s)`);

  const stats: Stats = {
    scanned: rows.length,
    textBackfilled: 0,
    visionBackfilled: 0,
    skipped: 0,
  };

  for (const row of rows) {
    const probe = await probeFile(row.storagePath, row.fileType);
    if (!probe) {
      stats.skipped++;
      console.log(
        `  - ${row.id} (${row.fileType ?? "unknown"}): unable to probe, leaving as-is`,
      );
      continue;
    }

    if (probe.mode === "text") stats.textBackfilled++;
    else stats.visionBackfilled++;

    console.log(
      `  - ${row.id} (${row.fileType ?? "unknown"}): ${probe.mode}`,
    );

    if (DRY_RUN) continue;

    const current =
      row.extraction && typeof row.extraction === "object"
        ? (row.extraction as Record<string, unknown>)
        : {};
    const updated = { ...current, _analysis_mode: probe.mode };

    await db
      .update(societaryExtractionsTable)
      .set({ extraction: updated })
      .where(eq(societaryExtractionsTable.id, row.id));
  }

  return stats;
}

async function main(): Promise<void> {
  if (DRY_RUN) console.log("(dry-run mode — no writes will occur)");
  if (LIMIT) console.log(`(processing at most ${LIMIT} row(s) per table)`);

  const docStats = await backfillClinicDocuments();
  const extStats = await backfillSocietaryExtractions();

  console.log("\n--- Summary ---");
  console.log(
    `clinic_documents:        scanned=${docStats.scanned}, text=${docStats.textBackfilled}, vision=${docStats.visionBackfilled}, skipped=${docStats.skipped}`,
  );
  console.log(
    `societary_extractions:   scanned=${extStats.scanned}, text=${extStats.textBackfilled}, vision=${extStats.visionBackfilled}, skipped=${extStats.skipped}`,
  );
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
