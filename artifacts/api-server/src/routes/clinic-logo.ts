import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { Readable } from "stream";
import multer, { MulterError } from "multer";
import { eq } from "drizzle-orm";
import { db, clinicsTable } from "@workspace/db";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";

const objectStorageService = new ObjectStorageService();
const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_LOGO_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES, files: 1 },
});

function clinicIdParam(req: Request): string {
  const raw = req.params.id;
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Public router — serves the clinic logo without authentication. The logo is
 * not confidential and needs to render anywhere in the UI (panel, modules,
 * cards) via a plain <img src>, so it must be reachable without a bearer token
 * or an expiring signed URL.
 *
 * Mounted BEFORE the `requireClinicAccess` layer in routes/index.ts.
 */
const clinicLogoPublicRouter: IRouter = Router();

clinicLogoPublicRouter.get(
  "/clinics/:id/logo",
  async (req: Request, res: Response): Promise<void> => {
    const clinicId = clinicIdParam(req);
    try {
      const [clinic] = await db
        .select({ logoUrl: clinicsTable.logoUrl })
        .from(clinicsTable)
        .where(eq(clinicsTable.id, clinicId));

      if (!clinic || !clinic.logoUrl) {
        res.status(404).json({ error: "Logo não encontrada" });
        return;
      }

      const file = await objectStorageService.getObjectEntityFile(clinic.logoUrl);
      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => {
        // Override caching below; the logo is public.
        if (key.toLowerCase() === "cache-control") return;
        res.setHeader(key, value);
      });
      res.setHeader("Cache-Control", "public, max-age=300");

      if (response.body) {
        const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Logo não encontrada" });
        return;
      }
      req.log.error({ err }, "Failed to serve clinic logo");
      res.status(500).json({ error: "Falha ao servir a logo" });
    }
  },
);

/**
 * Scoped router — upload/remove the clinic logo. Mounted under
 * `requireClinicAccess` so super admins and the managers of that clinic can
 * change it.
 */
const clinicLogoScopedRouter: IRouter = Router();

function uploadSingleWithErrorHandler(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          error: `Arquivo excede o limite de ${Math.round(MAX_LOGO_BYTES / 1024 / 1024)}MB`,
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

async function uploadLogoBuffer(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (fileBuffer.byteLength > MAX_LOGO_BYTES) {
    throw new Error(
      `Arquivo excede o limite de ${Math.round(MAX_LOGO_BYTES / 1024 / 1024)}MB`,
    );
  }
  const uploadURL = await objectStorageService.getObjectEntityUploadURL();
  const uploadRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: fileBuffer,
  });
  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Upload falhou: ${err}`);
  }
  return objectStorageService.normalizeObjectEntityPath(uploadURL);
}

clinicLogoScopedRouter.post(
  "/clinics/:id/logo",
  uploadSingleWithErrorHandler,
  async (req: Request, res: Response): Promise<void> => {
    const clinicId = clinicIdParam(req);
    const file = (req as Request & { file?: Express.Multer.File }).file;

    if (!file) {
      res.status(400).json({ error: "Arquivo (campo 'file') é obrigatório" });
      return;
    }

    const mimeType = file.mimetype || "application/octet-stream";
    if (!ALLOWED_LOGO_MIME_TYPES.has(mimeType)) {
      res.status(415).json({
        error: `Tipo de imagem não suportado: ${mimeType}. Use PNG, JPG, SVG ou WebP.`,
      });
      return;
    }

    const [existing] = await db
      .select({ logoUrl: clinicsTable.logoUrl })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId));
    if (!existing) {
      res.status(404).json({ error: "Clínica não encontrada" });
      return;
    }

    let storagePath: string;
    try {
      storagePath = await uploadLogoBuffer(file.buffer, mimeType);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
      return;
    }

    const [clinic] = await db
      .update(clinicsTable)
      .set({ logoUrl: storagePath, updatedAt: new Date() })
      .where(eq(clinicsTable.id, clinicId))
      .returning();

    res.status(200).json({ logoUrl: clinic.logoUrl });
  },
);

clinicLogoScopedRouter.delete(
  "/clinics/:id/logo",
  async (req: Request, res: Response): Promise<void> => {
    const clinicId = clinicIdParam(req);

    const [clinic] = await db
      .update(clinicsTable)
      .set({ logoUrl: null, updatedAt: new Date() })
      .where(eq(clinicsTable.id, clinicId))
      .returning();

    if (!clinic) {
      res.status(404).json({ error: "Clínica não encontrada" });
      return;
    }

    res.status(200).json({ logoUrl: null });
  },
);

export { clinicLogoPublicRouter, clinicLogoScopedRouter };
