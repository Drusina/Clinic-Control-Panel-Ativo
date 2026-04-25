import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, documentosTable } from "@workspace/db";

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
  const { fileName, fileBase64, mimeType } = req.body;

  if (!fileName || !fileBase64) {
    res.status(400).json({ error: "fileName and fileBase64 are required" });
    return;
  }

  const fileBuffer = Buffer.from(fileBase64, "base64");
  const storagePath = `clinics/${clinicId}/documentos/${docId}_${fileName}`;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/clinic-docs/${storagePath}`, {
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
  const [row] = await db.delete(documentosTable).where(eq(documentosTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

export default router;
