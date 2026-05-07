import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import {
  db,
  clinicDocumentsTable,
  documentCategoriesTable,
  clinicsTable,
} from "@workspace/db";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { signToken } from "../middleware/auth.js";
import {
  summarizeDocument,
  isSummarizableMimeType,
  UnsupportedFileTypeError,
  EmptyDocumentError,
  PdfExtractionError,
} from "../lib/aiSummarizer.js";

const objectStorageService = new ObjectStorageService();
const SIGNED_URL_TTL_SECONDS = 3600;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

const router: IRouter = Router();

type SummaryAnalysisMode = "text" | "vision";

interface DocMapped {
  id: string;
  clinicId: string;
  categoryId: string;
  sequenceNumber: number;
  title: string;
  fileName: string;
  storagePath: string;
  fileSize: number | null;
  fileType: string | null;
  uploadedBy: string | null;
  summary: string | null;
  summarizedAt: string | null;
  summaryAnalysisMode: SummaryAnalysisMode | null;
  summaryPagesAnalyzed: number | null;
  summaryTotalPages: number | null;
  createdAt: string;
}

function mapDoc(d: typeof clinicDocumentsTable.$inferSelect): DocMapped {
  const mode =
    d.summaryAnalysisMode === "vision" || d.summaryAnalysisMode === "text"
      ? d.summaryAnalysisMode
      : null;
  return {
    id: d.id,
    clinicId: d.clinicId,
    categoryId: d.categoryId,
    sequenceNumber: d.sequenceNumber,
    title: d.title,
    fileName: d.fileName,
    storagePath: d.storagePath,
    fileSize: d.fileSize ?? null,
    fileType: d.fileType ?? null,
    uploadedBy: d.uploadedBy ?? null,
    summary: d.summary ?? null,
    summarizedAt: d.summarizedAt ? d.summarizedAt.toISOString() : null,
    summaryAnalysisMode: mode,
    summaryPagesAnalyzed: d.summaryPagesAnalyzed ?? null,
    summaryTotalPages: d.summaryTotalPages ?? null,
    createdAt: d.createdAt.toISOString(),
  };
}

router.get("/clinics/:clinicId/documents", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const rows = await db
    .select()
    .from(clinicDocumentsTable)
    .where(eq(clinicDocumentsTable.clinicId, clinicId))
    .orderBy(asc(clinicDocumentsTable.sequenceNumber), asc(clinicDocumentsTable.createdAt));

  res.json(rows.map(mapDoc));
});

async function uploadFileBuffer(
  fileBuffer: Buffer,
  mimeType: string | undefined,
): Promise<{ storagePath: string; size: number }> {
  if (fileBuffer.byteLength > MAX_FILE_BYTES) {
    throw new Error(
      `Arquivo excede o limite de ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB`,
    );
  }
  const contentType = mimeType ?? "application/octet-stream";

  const uploadURL = await objectStorageService.getObjectEntityUploadURL();
  const uploadRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: fileBuffer,
  });
  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Upload falhou: ${err}`);
  }
  const storagePath = objectStorageService.normalizeObjectEntityPath(uploadURL);
  return { storagePath, size: fileBuffer.byteLength };
}

// Decodes a multipart filename which is sometimes received as latin1 bytes
// when the client/proxy doesn't set RFC 5987 encoding. We re-interpret the
// bytes as UTF-8 (since browsers send filenames as UTF-8 by default) and
// normalize to NFC so accented characters render correctly.
function decodeMultipartFilename(name: string): string {
  if (!name) return name;
  // Heuristic: if any code point is in the C1 range, the value is likely
  // mis-decoded latin1 of UTF-8 bytes. Re-encode and decode.
  let out = name;
  if (/[\u0080-\u00ff]/.test(name)) {
    try {
      const reinterpreted = Buffer.from(name, "latin1").toString("utf8");
      // Only adopt the reinterpreted value if it doesn't contain replacement chars
      if (!reinterpreted.includes("\uFFFD")) out = reinterpreted;
    } catch {
      /* keep original */
    }
  }
  return out.normalize("NFC");
}

function uploadSingleWithErrorHandler(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          error: `Arquivo excede o limite de ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB`,
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Falha ao processar upload";
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}

// The legacy endpoint POST /api/clinics/:id/documents?type=proposta|contrato
// (proposal/contract attachments in clinics.ts) shares the same path. When
// the request carries those query parameters, defer to the next router.
function skipIfLegacyAttachment(req: Request, _res: Response, next: NextFunction): void {
  const t = typeof req.query.type === "string" ? req.query.type : "";
  if (t === "proposta" || t === "contrato") {
    next("router");
    return;
  }
  next();
}

router.post(
  "/clinics/:clinicId/documents",
  skipIfLegacyAttachment,
  uploadSingleWithErrorHandler,
  async (req: Request, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId)
      ? req.params.clinicId[0]
      : req.params.clinicId;

    const file = (req as Request & { file?: Express.Multer.File }).file;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const categoryId = typeof body.categoryId === "string" ? body.categoryId : "";
    const titleRaw = typeof body.title === "string" ? body.title : "";

    if (!categoryId) {
      res.status(400).json({ error: "categoryId é obrigatório" });
      return;
    }
    if (!file) {
      res.status(400).json({ error: "Arquivo (campo 'file') é obrigatório" });
      return;
    }

    const fileName = decodeMultipartFilename(file.originalname || "arquivo");
    const mimeType = file.mimetype || "application/octet-stream";

    const ALLOWED_MIME_TYPES = new Set([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/tiff",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "application/zip",
      "application/x-zip-compressed",
    ]);

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      res.status(415).json({
        error: `Tipo de arquivo não suportado: ${mimeType}. Apenas PDF, imagens, documentos Office e arquivos de texto são permitidos.`,
      });
      return;
    }

    // Validate the category belongs to the clinic
    const [cat] = await db
      .select()
      .from(documentCategoriesTable)
      .where(
        and(
          eq(documentCategoriesTable.id, categoryId),
          eq(documentCategoriesTable.clinicId, clinicId),
        ),
      );
    if (!cat) {
      res.status(404).json({ error: "Categoria não encontrada nesta clínica" });
      return;
    }

    // Validate clinic exists (defensive)
    const [clinic] = await db
      .select({ id: clinicsTable.id })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId));
    if (!clinic) {
      res.status(404).json({ error: "Clínica não encontrada" });
      return;
    }

    let storagePath: string;
    let size: number;
    try {
      const uploaded = await uploadFileBuffer(file.buffer, mimeType);
      storagePath = uploaded.storagePath;
      size = uploaded.size;
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
      return;
    }

    const cleanTitle =
      titleRaw.trim().length > 0 ? titleRaw.trim() : fileName;

  // Atomic sequence assignment per clinic, protected by SELECT FOR UPDATE on
  // the clinic row to serialize concurrent inserts.
  const inserted = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM clinics WHERE id = ${clinicId} FOR UPDATE`);

    const last = await tx
      .select({ seq: clinicDocumentsTable.sequenceNumber })
      .from(clinicDocumentsTable)
      .where(eq(clinicDocumentsTable.clinicId, clinicId))
      .orderBy(desc(clinicDocumentsTable.sequenceNumber))
      .limit(1);

    const nextSeq = (last[0]?.seq ?? 0) + 1;

    const [row] = await tx
      .insert(clinicDocumentsTable)
      .values({
        clinicId,
        categoryId,
        sequenceNumber: nextSeq,
        title: cleanTitle,
        fileName,
        storagePath,
        fileSize: size,
        fileType: mimeType ?? null,
      })
      .returning();
    return row;
  });

  res.status(201).json(mapDoc(inserted));
});

router.delete("/clinics/:clinicId/documents/:id", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [doc] = await db
    .select()
    .from(clinicDocumentsTable)
    .where(
      and(
        eq(clinicDocumentsTable.id, id),
        eq(clinicDocumentsTable.clinicId, clinicId),
      ),
    );

  if (!doc) {
    res.status(404).json({ error: "Documento não encontrado" });
    return;
  }

  await db
    .delete(clinicDocumentsTable)
    .where(eq(clinicDocumentsTable.id, id));

  // Best-effort storage cleanup — log and continue on failure
  if (doc.storagePath?.startsWith("/objects/")) {
    try {
      const file = await objectStorageService.getObjectEntityFile(doc.storagePath);
      await file.delete({ ignoreNotFound: true });
    } catch (err) {
      if (!(err instanceof ObjectNotFoundError)) {
        console.warn(
          `[clinic-documents] Failed to delete storage for doc ${id}: ${(err as Error).message}`,
        );
      }
    }
  }

  res.json({ success: true });
});

router.get(
  "/clinics/:clinicId/documents/:id/signed-url",
  async (req, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const [doc] = await db
      .select()
      .from(clinicDocumentsTable)
      .where(
        and(
          eq(clinicDocumentsTable.id, id),
          eq(clinicDocumentsTable.clinicId, clinicId),
        ),
      );

    if (!doc) {
      res.status(404).json({ error: "Documento não encontrado" });
      return;
    }

    if (!doc.storagePath.startsWith("/objects/")) {
      res.status(410).json({ error: "Arquivo armazenado em local legado. Reenvie." });
      return;
    }

    const wildcardPath = doc.storagePath.slice("/objects/".length);
    try {
      const sigToken = signToken(
        { purpose: "signed_object_url", path: doc.storagePath },
        SIGNED_URL_TTL_SECONDS,
      );
      const url = `/api/storage/objects/${wildcardPath}?sig=${encodeURIComponent(sigToken)}`;
      res.json({ url });
    } catch (err) {
      res
        .status(500)
        .json({ error: `Failed to generate signed URL: ${(err as Error).message}` });
    }
  },
);

// Normalizes file_name and title strings to NFC and clears mojibake (?, replacement
// chars). Idempotent — safe to call multiple times.
router.post(
  "/clinics/:clinicId/documents/fix-encoding",
  async (req, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

    const docs = await db
      .select()
      .from(clinicDocumentsTable)
      .where(eq(clinicDocumentsTable.clinicId, clinicId));

    let fixed = 0;
    for (const d of docs) {
      const before = { fileName: d.fileName, title: d.title };
      const normalizedFileName = normalizeName(d.fileName);
      const normalizedTitle = normalizeName(d.title);
      if (
        normalizedFileName !== before.fileName ||
        normalizedTitle !== before.title
      ) {
        await db
          .update(clinicDocumentsTable)
          .set({ fileName: normalizedFileName, title: normalizedTitle })
          .where(eq(clinicDocumentsTable.id, d.id));
        fixed++;
      }
    }

    res.json({ fixed });
  },
);

router.post(
  "/clinics/:clinicId/documents/:id/summarize",
  async (req, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId)
      ? req.params.clinicId[0]
      : req.params.clinicId;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const [doc] = await db
      .select()
      .from(clinicDocumentsTable)
      .where(
        and(
          eq(clinicDocumentsTable.id, id),
          eq(clinicDocumentsTable.clinicId, clinicId),
        ),
      );

    if (!doc) {
      res.status(404).json({ error: "Documento não encontrado" });
      return;
    }

    if (!isSummarizableMimeType(doc.fileType)) {
      res.status(400).json({
        error: `Tipo de arquivo não suportado para resumo (${doc.fileType ?? "desconhecido"}). Apenas PDF e arquivos de texto.`,
      });
      return;
    }

    if (!doc.storagePath.startsWith("/objects/")) {
      res.status(410).json({
        error: "Arquivo armazenado em local legado. Reenvie para gerar resumo.",
      });
      return;
    }

    let fileBuffer: Buffer;
    try {
      const file = await objectStorageService.getObjectEntityFile(doc.storagePath);
      const [data] = await file.download();
      fileBuffer = data;
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Arquivo não encontrado no armazenamento." });
        return;
      }
      console.error(
        `[clinic-documents] storage read failed for doc ${id}:`,
        err,
      );
      res.status(500).json({ error: "Falha ao ler o arquivo do armazenamento." });
      return;
    }

    let result;
    try {
      result = await summarizeDocument(fileBuffer, doc.fileType);
    } catch (err) {
      if (
        err instanceof UnsupportedFileTypeError ||
        err instanceof EmptyDocumentError ||
        err instanceof PdfExtractionError
      ) {
        res.status(400).json({ error: err.message });
        return;
      }
      console.error(`[clinic-documents] summarize failed for doc ${id}:`, err);
      res.status(500).json({ error: "Falha ao gerar resumo. Tente novamente." });
      return;
    }

    const summarizedAt = new Date();
    await db
      .update(clinicDocumentsTable)
      .set({
        summary: result.summary,
        summarizedAt,
        summaryAnalysisMode: result.analysisMode,
        summaryPagesAnalyzed:
          result.pagesAnalyzed > 0 ? result.pagesAnalyzed : null,
        summaryTotalPages:
          result.totalPages > 0 ? result.totalPages : null,
      })
      .where(
        and(
          eq(clinicDocumentsTable.id, id),
          eq(clinicDocumentsTable.clinicId, clinicId),
        ),
      );

    res.json({
      summary: result.summary,
      summarizedAt: summarizedAt.toISOString(),
      summaryAnalysisMode: result.analysisMode,
      summaryPagesAnalyzed:
        result.pagesAnalyzed > 0 ? result.pagesAnalyzed : null,
      summaryTotalPages: result.totalPages > 0 ? result.totalPages : null,
    });
  },
);

function normalizeName(s: string): string {
  if (!s) return s;
  // Apply Unicode normalization
  let out = s.normalize("NFC");
  // Replace common mojibake & replacement chars with hyphens to keep something readable
  out = out.replace(/[\uFFFD]/g, "");
  // Strip stray escape sequences left as text (e.g. literal "\u00e7")
  out = out.replace(/\\u00[0-9a-fA-F]{2}/g, "");
  return out;
}

export default router;
