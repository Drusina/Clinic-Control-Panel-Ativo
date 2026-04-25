import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, evidenciasTable } from "@workspace/db";

const router: IRouter = Router();

function mapEvidencia(e: typeof evidenciasTable.$inferSelect) {
  return {
    id: e.id,
    clinicId: e.clinicId,
    pilarSlug: e.pilarSlug,
    nome: e.nome,
    tipo: e.tipo,
    descricao: e.descricao,
    responsavel: e.responsavel,
    storagePath: e.storagePath,
    tamanho: e.tamanho,
    mimeType: e.mimeType,
    createdAt: e.createdAt.toISOString(),
  };
}

router.get("/clinics/:clinicId/evidencias", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const rows = await db.select().from(evidenciasTable).where(eq(evidenciasTable.clinicId, clinicId)).orderBy(evidenciasTable.createdAt);
  res.json(rows.map(mapEvidencia));
});

router.post("/clinics/:clinicId/evidencias", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const d = req.body;
  if (!d.nome || !d.pilarSlug) {
    res.status(400).json({ error: "nome and pilarSlug are required" });
    return;
  }
  const [row] = await db
    .insert(evidenciasTable)
    .values({
      clinicId,
      pilarSlug: d.pilarSlug,
      nome: d.nome,
      tipo: d.tipo ?? null,
      descricao: d.descricao ?? null,
      responsavel: d.responsavel ?? null,
      storagePath: d.storagePath ?? null,
      tamanho: d.tamanho ?? null,
      mimeType: d.mimeType ?? null,
    })
    .returning();
  res.status(201).json(mapEvidencia(row));
});

router.post("/clinics/:clinicId/evidencias/upload", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const { fileName, fileBase64, mimeType, pilarSlug, descricao, responsavel } = req.body;

  if (!fileName || !fileBase64 || !pilarSlug) {
    res.status(400).json({ error: "fileName, fileBase64, and pilarSlug are required" });
    return;
  }

  const fileBuffer = Buffer.from(fileBase64, "base64");
  const storagePath = `clinics/${clinicId}/evidencias/${Date.now()}_${fileName}`;
  let finalStoragePath: string | null = null;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/evidencias/${storagePath}`, {
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
    finalStoragePath = storagePath;
  } else {
    finalStoragePath = storagePath;
  }

  const tipo = mimeType?.startsWith("image/") ? "imagem"
    : mimeType?.includes("pdf") ? "pdf"
    : mimeType?.includes("video") ? "video"
    : "arquivo";

  const [row] = await db
    .insert(evidenciasTable)
    .values({
      clinicId,
      pilarSlug,
      nome: fileName,
      tipo,
      descricao: descricao ?? null,
      responsavel: responsavel ?? null,
      storagePath: finalStoragePath,
      tamanho: fileBuffer.byteLength,
      mimeType: mimeType ?? null,
    })
    .returning();

  res.status(201).json(mapEvidencia(row));
});

router.delete("/evidencias/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [row] = await db.delete(evidenciasTable).where(eq(evidenciasTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

export default router;
