import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, docsConstitutivoTable, docsConstitutivoFilesTable } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { signToken } from "../middleware/auth.js";

const objectStorageService = new ObjectStorageService();
const SIGNED_URL_TTL_SECONDS = 3600;

const router: IRouter = Router();

interface DocFileMapped {
  id: string;
  fileName: string;
  storagePath: string;
  tamanho: number | null;
  sequenceNumber: number;
  enviadoEm: string;
}

function mapFile(f: typeof docsConstitutivoFilesTable.$inferSelect): DocFileMapped {
  return {
    id: f.id,
    fileName: f.fileName,
    storagePath: f.storagePath,
    tamanho: f.tamanho ?? null,
    sequenceNumber: f.sequenceNumber,
    enviadoEm: f.enviadoEm.toISOString(),
  };
}

function mapDoc(d: typeof docsConstitutivoTable.$inferSelect, files: DocFileMapped[]) {
  const latest = files.length > 0 ? files[files.length - 1] : null;
  // Backward-compat: if no migrated child rows, fall back to legacy single-file columns
  const fallbackPath = files.length === 0 ? d.storagePath ?? null : null;
  const fallbackSize = files.length === 0 ? d.tamanho ?? null : null;
  const fallbackDate =
    files.length === 0 ? d.enviadoEm?.toISOString() ?? null : null;
  return {
    id: d.id,
    clinicId: d.clinicId,
    categoria: d.categoria,
    nome: d.nome,
    obrigatorio: d.obrigatorio ?? false,
    files,
    storagePath: latest?.storagePath ?? fallbackPath,
    tamanho: latest?.tamanho ?? fallbackSize,
    enviadoEm: latest?.enviadoEm ?? fallbackDate,
    createdAt: d.createdAt.toISOString(),
  };
}

const DEFAULT_DOCS: Array<{ categoria: string; nome: string; obrigatorio: boolean }> = [
  { categoria: "Jurídico", nome: "Contrato Social", obrigatorio: true },
  { categoria: "Jurídico", nome: "Cartão CNPJ", obrigatorio: true },
  { categoria: "Funcionamento", nome: "Alvará", obrigatorio: true },
  { categoria: "Funcionamento", nome: "Licença Sanitária (VISA)", obrigatorio: true },
  { categoria: "Funcionamento", nome: "CRM do Responsável Técnico", obrigatorio: false },
  { categoria: "Financeiro", nome: "DRE", obrigatorio: false },
  { categoria: "Financeiro", nome: "Balanço Patrimonial", obrigatorio: false },
  { categoria: "Estrutura", nome: "Organograma", obrigatorio: false },
  { categoria: "Seguros", nome: "Apólice RC Profissional", obrigatorio: false },
];

async function seedDefaultDocs(clinicId: string): Promise<void> {
  const existing = await db
    .select({ nome: docsConstitutivoTable.nome })
    .from(docsConstitutivoTable)
    .where(eq(docsConstitutivoTable.clinicId, clinicId));

  const existingNomes = new Set(existing.map((r) => r.nome));
  const toInsert = DEFAULT_DOCS.filter((d) => !existingNomes.has(d.nome));

  if (toInsert.length > 0) {
    await db.insert(docsConstitutivoTable).values(
      toInsert.map((d) => ({
        clinicId,
        categoria: d.categoria,
        nome: d.nome,
        obrigatorio: d.obrigatorio,
      }))
    );
  }
}

async function loadFilesForDocs(docIds: string[]): Promise<Map<string, DocFileMapped[]>> {
  const map = new Map<string, DocFileMapped[]>();
  if (docIds.length === 0) return map;

  const rows = await db
    .select()
    .from(docsConstitutivoFilesTable)
    .orderBy(docsConstitutivoFilesTable.sequenceNumber);

  for (const row of rows) {
    if (!docIds.includes(row.docId)) continue;
    const arr = map.get(row.docId) ?? [];
    arr.push(mapFile(row));
    map.set(row.docId, arr);
  }
  return map;
}

router.get("/clinics/:clinicId/docs-constitutivos", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  await seedDefaultDocs(clinicId);

  const rows = await db
    .select()
    .from(docsConstitutivoTable)
    .where(eq(docsConstitutivoTable.clinicId, clinicId))
    .orderBy(docsConstitutivoTable.createdAt);

  const filesMap = await loadFilesForDocs(rows.map((r) => r.id));

  res.json(rows.map((r) => mapDoc(r, filesMap.get(r.id) ?? [])));
});

router.post("/clinics/:clinicId/docs-constitutivos", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const d = req.body;

  if (!d.categoria || !d.nome) {
    res.status(400).json({ error: "categoria and nome are required" });
    return;
  }

  const [doc] = await db
    .insert(docsConstitutivoTable)
    .values({
      clinicId,
      categoria: d.categoria,
      nome: d.nome,
      obrigatorio: d.obrigatorio ?? false,
    })
    .returning();

  res.status(201).json(mapDoc(doc, []));
});

router.patch("/clinics/:clinicId/docs-constitutivos/:docId", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;
  const d = req.body;

  const updates: Partial<typeof docsConstitutivoTable.$inferInsert> = {};
  if (d.categoria !== undefined) updates.categoria = d.categoria;
  if (d.nome !== undefined) updates.nome = d.nome;
  if (d.obrigatorio !== undefined) updates.obrigatorio = d.obrigatorio;

  const [doc] = await db
    .update(docsConstitutivoTable)
    .set(updates)
    .where(and(eq(docsConstitutivoTable.id, docId), eq(docsConstitutivoTable.clinicId, clinicId)))
    .returning();

  if (!doc) {
    res.status(404).json({ error: "Documento not found" });
    return;
  }

  const files = await db
    .select()
    .from(docsConstitutivoFilesTable)
    .where(eq(docsConstitutivoFilesTable.docId, docId))
    .orderBy(docsConstitutivoFilesTable.sequenceNumber);

  res.json(mapDoc(doc, files.map(mapFile)));
});

async function uploadFileBuffer(
  fileBase64: string,
  mimeType: string | undefined,
): Promise<{ storagePath: string; size: number }> {
  const fileBuffer = Buffer.from(fileBase64, "base64");
  const contentType = mimeType ?? "application/pdf";

  const uploadURL = await objectStorageService.getObjectEntityUploadURL();
  const uploadRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: fileBuffer,
  });
  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Upload failed: ${err}`);
  }
  const storagePath = objectStorageService.normalizeObjectEntityPath(uploadURL);
  return { storagePath, size: fileBuffer.byteLength };
}

async function appendFileToDoc(
  docId: string,
  fileName: string,
  storagePath: string,
  size: number,
): Promise<DocFileMapped> {
  // Serialize sequence assignment for the same doc by locking the parent row
  // (FOR UPDATE) inside a transaction. The unique index on
  // (doc_id, sequence_number) is a defense-in-depth safety net.
  return await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM docs_constitutivos WHERE id = ${docId} FOR UPDATE`,
    );

    const existing = await tx
      .select({ seq: docsConstitutivoFilesTable.sequenceNumber })
      .from(docsConstitutivoFilesTable)
      .where(eq(docsConstitutivoFilesTable.docId, docId))
      .orderBy(desc(docsConstitutivoFilesTable.sequenceNumber))
      .limit(1);

    const nextSeq = (existing[0]?.seq ?? 0) + 1;

    const [row] = await tx
      .insert(docsConstitutivoFilesTable)
      .values({
        docId,
        storagePath,
        fileName,
        tamanho: size,
        sequenceNumber: nextSeq,
      })
      .returning();

    return mapFile(row);
  });
}

// Legacy endpoint (kept for backward compat) — appends a new file instead of replacing
router.post("/clinics/:clinicId/docs-constitutivos/:docId/upload", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;

  const { fileName, fileBase64, mimeType } = req.body;
  if (!fileName || !fileBase64) {
    res.status(400).json({ error: "fileName and fileBase64 are required" });
    return;
  }

  const [doc] = await db
    .select()
    .from(docsConstitutivoTable)
    .where(and(eq(docsConstitutivoTable.id, docId), eq(docsConstitutivoTable.clinicId, clinicId)));

  if (!doc) {
    res.status(404).json({ error: "Documento not found" });
    return;
  }

  try {
    const { storagePath, size } = await uploadFileBuffer(fileBase64, mimeType);
    await appendFileToDoc(docId, fileName, storagePath, size);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
    return;
  }

  const files = await db
    .select()
    .from(docsConstitutivoFilesTable)
    .where(eq(docsConstitutivoFilesTable.docId, docId))
    .orderBy(docsConstitutivoFilesTable.sequenceNumber);

  res.json(mapDoc(doc, files.map(mapFile)));
});

// New: add another file to a slot
router.post("/clinics/:clinicId/docs-constitutivos/:docId/files", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;

  const { fileName, fileBase64, mimeType } = req.body;
  if (!fileName || !fileBase64) {
    res.status(400).json({ error: "fileName and fileBase64 are required" });
    return;
  }

  const [doc] = await db
    .select()
    .from(docsConstitutivoTable)
    .where(and(eq(docsConstitutivoTable.id, docId), eq(docsConstitutivoTable.clinicId, clinicId)));

  if (!doc) {
    res.status(404).json({ error: "Documento not found" });
    return;
  }

  try {
    const { storagePath, size } = await uploadFileBuffer(fileBase64, mimeType);
    const file = await appendFileToDoc(docId, fileName, storagePath, size);
    res.status(201).json(file);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// New: delete one file
router.delete(
  "/clinics/:clinicId/docs-constitutivos/:docId/files/:fileId",
  async (req, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
    const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;
    const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;

    const [doc] = await db
      .select()
      .from(docsConstitutivoTable)
      .where(and(eq(docsConstitutivoTable.id, docId), eq(docsConstitutivoTable.clinicId, clinicId)));

    if (!doc) {
      res.status(404).json({ error: "Documento not found" });
      return;
    }

    const deleted = await db
      .delete(docsConstitutivoFilesTable)
      .where(and(eq(docsConstitutivoFilesTable.id, fileId), eq(docsConstitutivoFilesTable.docId, docId)))
      .returning();

    if (deleted.length === 0) {
      res.status(404).json({ error: "Arquivo not found" });
      return;
    }

    res.json({ success: true });
  },
);

// New: signed URL for a specific file
router.get(
  "/clinics/:clinicId/docs-constitutivos/:docId/files/:fileId/signed-url",
  async (req, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
    const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;
    const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;

    const [doc] = await db
      .select()
      .from(docsConstitutivoTable)
      .where(and(eq(docsConstitutivoTable.id, docId), eq(docsConstitutivoTable.clinicId, clinicId)));

    if (!doc) {
      res.status(404).json({ error: "Documento not found" });
      return;
    }

    const [file] = await db
      .select()
      .from(docsConstitutivoFilesTable)
      .where(and(eq(docsConstitutivoFilesTable.id, fileId), eq(docsConstitutivoFilesTable.docId, docId)));

    if (!file) {
      res.status(404).json({ error: "Arquivo not found" });
      return;
    }

    if (!file.storagePath.startsWith("/objects/")) {
      res.status(410).json({ error: "Arquivo armazenado em local legado. Reenvie." });
      return;
    }

    const wildcardPath = file.storagePath.slice("/objects/".length);
    try {
      const sigToken = signToken(
        { purpose: "signed_object_url", path: file.storagePath },
        SIGNED_URL_TTL_SECONDS,
      );
      const url = `/api/storage/objects/${wildcardPath}?sig=${encodeURIComponent(sigToken)}`;
      res.json({ url });
    } catch (err) {
      res.status(500).json({ error: `Failed to generate signed URL: ${(err as Error).message}` });
    }
  },
);

// Legacy signed-url endpoint — now returns the URL of the latest file
router.get("/clinics/:clinicId/docs-constitutivos/:docId/signed-url", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;

  const [doc] = await db
    .select()
    .from(docsConstitutivoTable)
    .where(and(eq(docsConstitutivoTable.id, docId), eq(docsConstitutivoTable.clinicId, clinicId)));

  if (!doc) {
    res.status(404).json({ error: "Documento not found" });
    return;
  }

  const [file] = await db
    .select()
    .from(docsConstitutivoFilesTable)
    .where(eq(docsConstitutivoFilesTable.docId, docId))
    .orderBy(desc(docsConstitutivoFilesTable.sequenceNumber))
    .limit(1);

  if (!file) {
    res.status(404).json({ error: "Documento sem arquivos enviados" });
    return;
  }

  if (!file.storagePath.startsWith("/objects/")) {
    res.status(410).json({ error: "Arquivo armazenado em local legado. Reenvie." });
    return;
  }

  const wildcardPath = file.storagePath.slice("/objects/".length);
  try {
    const sigToken = signToken(
      { purpose: "signed_object_url", path: file.storagePath },
      SIGNED_URL_TTL_SECONDS,
    );
    const url = `/api/storage/objects/${wildcardPath}?sig=${encodeURIComponent(sigToken)}`;
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: `Failed to generate signed URL: ${(err as Error).message}` });
  }
});

export default router;
