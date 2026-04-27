import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, documentosTable } from "@workspace/db";
import { assertClinicAccess } from "../middleware/auth";
import path from "path";

function sanitizeFileName(raw: string): string {
  return path.posix.basename(raw.replace(/\\/g, "/")).replace(/\.\./g, "_");
}

const router: IRouter = Router();

function mapDocumento(d: typeof documentosTable.$inferSelect) {
  return {
    id: d.id,
    clinicId: d.clinicId,
    nome: d.nome,
    categoria: d.categoria,
    storagePath: d.storagePath,
    tamanho: d.tamanho,
    mimeType: d.mimeType,
    validade: d.validade,
    status: d.status,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

router.get("/clinics/:clinicId/documentos", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const rows = await db.select().from(documentosTable).where(eq(documentosTable.clinicId, clinicId)).orderBy(documentosTable.createdAt);
  res.json(rows.map(mapDocumento));
});

router.post("/clinics/:clinicId/documentos", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const d = req.body;
  if (!d.nome || !d.categoria) {
    res.status(400).json({ error: "nome and categoria are required" });
    return;
  }
  const [row] = await db
    .insert(documentosTable)
    .values({
      clinicId,
      nome: d.nome,
      categoria: d.categoria,
      storagePath: d.storagePath ?? null,
      tamanho: d.tamanho ?? null,
      mimeType: d.mimeType ?? null,
      validade: d.validade ?? null,
      status: d.status ?? "pendente",
    })
    .returning();
  res.status(201).json(mapDocumento(row));
});

router.patch("/documentos/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [existingDoc] = await db
    .select({ clinicId: documentosTable.clinicId })
    .from(documentosTable)
    .where(eq(documentosTable.id, id))
    .limit(1);
  if (!existingDoc) { res.status(404).json({ error: "Not found" }); return; }
  if (await assertClinicAccess(req, res, existingDoc.clinicId)) return;

  const d = req.body;
  const updates: Partial<typeof documentosTable.$inferInsert> = { updatedAt: new Date() };
  if (d.nome !== undefined) updates.nome = d.nome;
  if (d.categoria !== undefined) updates.categoria = d.categoria;
  if (d.validade !== undefined) updates.validade = d.validade;
  if (d.status !== undefined) updates.status = d.status;
  if (d.storagePath !== undefined) updates.storagePath = d.storagePath;
  if (d.tamanho !== undefined) updates.tamanho = d.tamanho;
  if (d.mimeType !== undefined) updates.mimeType = d.mimeType;
  const [row] = await db.update(documentosTable).set(updates).where(eq(documentosTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(mapDocumento(row));
});

router.post("/clinics/:clinicId/documentos/:docId/upload", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;

  // Defense-in-depth: even though `requireClinicAccess` already authorised the
  // caller for `clinicId`, the route mixes two ids — verify that `docId`
  // actually belongs to `clinicId` so a manager from clinic A cannot mutate
  // (or replace the storage path of) clinic B's document by guessing its uuid.
  const [docOwner] = await db
    .select({ clinicId: documentosTable.clinicId })
    .from(documentosTable)
    .where(eq(documentosTable.id, docId))
    .limit(1);
  if (!docOwner) { res.status(404).json({ error: "Not found" }); return; }
  if (docOwner.clinicId !== clinicId) {
    res.status(403).json({ error: "Forbidden: documento não pertence à clínica" });
    return;
  }

  const { fileName, fileBase64, mimeType } = req.body;

  if (!fileName || !fileBase64) {
    res.status(400).json({ error: "fileName and fileBase64 are required" });
    return;
  }

  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB decoded
  const fileBuffer = Buffer.from(fileBase64, "base64");
  if (fileBuffer.byteLength > MAX_UPLOAD_BYTES) {
    res.status(413).json({ error: `Arquivo excede o limite de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB` });
    return;
  }
  const safeFileName = sanitizeFileName(fileName);
  if (!safeFileName) {
    res.status(400).json({ error: "fileName inválido" });
    return;
  }
  const storagePath = `clinics/${clinicId}/documentos/${docId}_${safeFileName}`;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    const encodedStoragePath = storagePath.split("/").map(encodeURIComponent).join("/");
    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/clinic-docs/${encodedStoragePath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": mimeType ?? "application/octet-stream",
        "x-upsert": "true",
      },
      body: fileBuffer,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      res.status(500).json({ error: `Upload failed: ${err}` });
      return;
    }
  }

  const [row] = await db
    .update(documentosTable)
    .set({
      storagePath,
      tamanho: fileBuffer.byteLength,
      mimeType: mimeType ?? null,
      status: "ativo",
      updatedAt: new Date(),
    })
    .where(eq(documentosTable.id, docId))
    .returning();

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(mapDocumento(row));
});

router.delete("/documentos/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [existingDoc] = await db
    .select({ clinicId: documentosTable.clinicId })
    .from(documentosTable)
    .where(eq(documentosTable.id, id))
    .limit(1);
  if (!existingDoc) { res.status(404).json({ error: "Not found" }); return; }
  if (await assertClinicAccess(req, res, existingDoc.clinicId)) return;
  await db.delete(documentosTable).where(eq(documentosTable.id, id));
  res.sendStatus(204);
});

export default router;
