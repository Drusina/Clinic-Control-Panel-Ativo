import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, docsConstitutivoTable } from "@workspace/db";

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

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    res.status(501).json({ error: "Supabase Storage não configurado." });
    return;
  }

  const { fileName, fileBase64, mimeType } = req.body;
  if (!fileName || !fileBase64) {
    res.status(400).json({ error: "fileName and fileBase64 are required" });
    return;
  }

  const storagePath = `clinics/${clinicId}/docs/${fileName}`;
  const fileBuffer = Buffer.from(fileBase64, "base64");

  const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/clinic-docs/${storagePath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": mimeType ?? "application/pdf",
      "x-upsert": "true",
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    res.status(500).json({ error: `Upload failed: ${err}` });
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

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    res.json({ url: `${process.env.SUPABASE_URL}/storage/v1/object/public/clinic-docs/${doc.storagePath}` });
    return;
  }

  const signRes = await fetch(`${supabaseUrl}/storage/v1/object/sign/clinic-docs/${doc.storagePath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 3600 }),
  });

  if (!signRes.ok) {
    res.status(500).json({ error: "Failed to generate signed URL" });
    return;
  }

  const { signedURL } = await signRes.json() as { signedURL: string };
  res.json({ url: `${supabaseUrl}/storage/v1${signedURL}` });
});

export default router;
