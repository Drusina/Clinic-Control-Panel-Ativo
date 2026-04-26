import { Router, type IRouter } from "express";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import {
  db,
  clinicDocumentsTable,
  documentCategoriesTable,
  clinicsTable,
} from "@workspace/db";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { signToken } from "../middleware/auth.js";

const objectStorageService = new ObjectStorageService();
const SIGNED_URL_TTL_SECONDS = 3600;
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

const router: IRouter = Router();

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
  createdAt: string;
}

function mapDoc(d: typeof clinicDocumentsTable.$inferSelect): DocMapped {
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
  fileBase64: string,
  mimeType: string | undefined,
): Promise<{ storagePath: string; size: number }> {
  const fileBuffer = Buffer.from(fileBase64, "base64");
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

router.post("/clinics/:clinicId/documents", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const { categoryId, title, fileName, fileBase64, mimeType } = req.body ?? {};

  if (!categoryId || typeof categoryId !== "string") {
    res.status(400).json({ error: "categoryId é obrigatório" });
    return;
  }
  if (!fileName || typeof fileName !== "string") {
    res.status(400).json({ error: "fileName é obrigatório" });
    return;
  }
  if (!fileBase64 || typeof fileBase64 !== "string") {
    res.status(400).json({ error: "fileBase64 é obrigatório" });
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
    const upload = await uploadFileBuffer(fileBase64, mimeType);
    storagePath = upload.storagePath;
    size = upload.size;
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
    return;
  }

  const cleanTitle =
    typeof title === "string" && title.trim().length > 0
      ? title.trim()
      : fileName;

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
