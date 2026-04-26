import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, docsConstitutivoTable } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { signToken } from "../middleware/auth.js";

const objectStorageService = new ObjectStorageService();
const SIGNED_URL_TTL_SECONDS = 3600;

const router: IRouter = Router();

function mapDoc(d: typeof docsConstitutivoTable.$inferSelect) {
  return {
    id: d.id,
    clinicId: d.clinicId,
    categoria: d.categoria,
    nome: d.nome,
    obrigatorio: d.obrigatorio ?? false,
    storagePath: d.storagePath ?? null,
    tamanho: d.tamanho ?? null,
    enviadoEm: d.enviadoEm?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
  };
}

router.get("/clinics/:clinicId/docs-constitutivos", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const rows = await db
    .select()
    .from(docsConstitutivoTable)
    .where(eq(docsConstitutivoTable.clinicId, clinicId))
    .orderBy(docsConstitutivoTable.createdAt);

  res.json(rows.map(mapDoc));
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
      storagePath: d.storagePath ?? null,
      tamanho: d.tamanho ?? null,
      enviadoEm: d.enviadoEm ? new Date(d.enviadoEm) : null,
    })
    .returning();

  res.status(201).json(mapDoc(doc));
});

router.patch("/clinics/:clinicId/docs-constitutivos/:docId", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;
  const d = req.body;

  const updates: Partial<typeof docsConstitutivoTable.$inferInsert> = {};
  if (d.categoria !== undefined) updates.categoria = d.categoria;
  if (d.nome !== undefined) updates.nome = d.nome;
  if (d.obrigatorio !== undefined) updates.obrigatorio = d.obrigatorio;
  if (d.storagePath !== undefined) updates.storagePath = d.storagePath;
  if (d.tamanho !== undefined) updates.tamanho = d.tamanho;
  if (d.enviadoEm !== undefined) updates.enviadoEm = d.enviadoEm ? new Date(d.enviadoEm) : null;

  const [doc] = await db
    .update(docsConstitutivoTable)
    .set(updates)
    .where(and(eq(docsConstitutivoTable.id, docId), eq(docsConstitutivoTable.clinicId, clinicId)))
    .returning();

  if (!doc) {
    res.status(404).json({ error: "Documento not found" });
    return;
  }

  res.json(mapDoc(doc));
});

router.post("/clinics/:clinicId/docs-constitutivos/:docId/upload", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;

  const { fileName, fileBase64, mimeType } = req.body;
  if (!fileName || !fileBase64) {
    res.status(400).json({ error: "fileName and fileBase64 are required" });
    return;
  }

  const fileBuffer = Buffer.from(fileBase64, "base64");
  const contentType = mimeType ?? "application/pdf";

  let storagePath: string;
  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const uploadRes = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: fileBuffer,
    });
    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      res.status(500).json({ error: `Upload failed: ${err}` });
      return;
    }
    storagePath = objectStorageService.normalizeObjectEntityPath(uploadURL);
  } catch (err) {
    res.status(500).json({ error: `Upload failed: ${(err as Error).message}` });
    return;
  }

  const [doc] = await db
    .update(docsConstitutivoTable)
    .set({
      storagePath,
      tamanho: fileBuffer.byteLength,
      enviadoEm: new Date(),
    })
    .where(and(eq(docsConstitutivoTable.id, docId), eq(docsConstitutivoTable.clinicId, clinicId)))
    .returning();

  if (!doc) {
    res.status(404).json({ error: "Documento not found" });
    return;
  }

  res.json(mapDoc(doc));
});

router.get("/clinics/:clinicId/docs-constitutivos/:docId/signed-url", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;

  const [doc] = await db
    .select()
    .from(docsConstitutivoTable)
    .where(and(eq(docsConstitutivoTable.id, docId), eq(docsConstitutivoTable.clinicId, clinicId)));

  if (!doc || !doc.storagePath) {
    res.status(404).json({ error: "Documento not found or no file uploaded" });
    return;
  }

  if (!doc.storagePath.startsWith("/objects/")) {
    res.status(410).json({ error: "Documento armazenado em local legado. Reenvie o arquivo." });
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
    res.status(500).json({ error: `Failed to generate signed URL: ${(err as Error).message}` });
  }
});

export default router;
