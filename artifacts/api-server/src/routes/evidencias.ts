import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, evidenciasTable } from "@workspace/db";
import { assertClinicAccess } from "../middleware/auth";
import path from "path";

function sanitizeFileName(raw: string): string {
  return path.posix.basename(raw.replace(/\\/g, "/")).replace(/\.\./g, "_");
}

function isValidStoragePath(storagePath: string, clinicId: string): boolean {
  const normalized = path.posix.normalize(storagePath);
  return (
    !normalized.includes("..") &&
    normalized.startsWith(`clinics/${clinicId}/`)
  );
}

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
  if (d.storagePath != null && !isValidStoragePath(String(d.storagePath), clinicId)) {
    res.status(400).json({ error: "storagePath inválido" });
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
  const storagePath = `clinics/${clinicId}/evidencias/${Date.now()}_${safeFileName}`;
  let finalStoragePath: string | null = null;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    const encodedStoragePath = storagePath.split("/").map(encodeURIComponent).join("/");
    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/evidencias/${encodedStoragePath}`, {
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

router.get("/clinics/:clinicId/evidencias/:evidenciaId/signed-url", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const evidenciaId = Array.isArray(req.params.evidenciaId) ? req.params.evidenciaId[0] : req.params.evidenciaId;

  const [ev] = await db
    .select()
    .from(evidenciasTable)
    .where(and(eq(evidenciasTable.id, evidenciaId), eq(evidenciasTable.clinicId, clinicId)));

  if (!ev || !ev.storagePath) {
    res.status(404).json({ error: "Evidência not found or no file uploaded" });
    return;
  }

  if (!isValidStoragePath(ev.storagePath, clinicId)) {
    res.status(400).json({ error: "storagePath inválido" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    res.status(501).json({ error: "Supabase Storage não configurado no servidor." });
    return;
  }

  const encodedPath = ev.storagePath.split("/").map(encodeURIComponent).join("/");
  const signRes = await fetch(`${supabaseUrl}/storage/v1/object/sign/evidencias/${encodedPath}`, {
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

router.delete("/evidencias/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [existingEv] = await db
    .select({ clinicId: evidenciasTable.clinicId })
    .from(evidenciasTable)
    .where(eq(evidenciasTable.id, id))
    .limit(1);
  if (!existingEv) { res.status(404).json({ error: "Not found" }); return; }
  if (await assertClinicAccess(req, res, existingEv.clinicId)) return;
  await db.delete(evidenciasTable).where(eq(evidenciasTable.id, id));
  res.sendStatus(204);
});

export default router;
