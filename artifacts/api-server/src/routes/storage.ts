import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireSuperAdmin, verifyToken, extractToken, signToken } from "../middleware/auth";
import { db, documentAccessLogTable } from "@workspace/db";

const RequestUploadUrlBody = z.object({
  name: z.string(),
  size: z.number(),
  contentType: z.string(),
});

const RequestUploadUrlResponse = z.object({
  uploadURL: z.string(),
  objectPath: z.string(),
  metadata: z.object({
    name: z.string(),
    size: z.number(),
    contentType: z.string(),
  }),
});

const log = {
  error: (obj: unknown, msg: string) => console.error(msg, obj),
  warn: (obj: unknown, msg: string) => console.warn(msg, obj),
};

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

async function logDocumentAccess(req: Request, objectPath: string): Promise<void> {
  try {
    const token = extractToken(req);
    const payload = token ? verifyToken(token) : null;
    const accessedBy = (payload?.sub as string | undefined) ?? "unknown";
    const role = (payload?.role as string | undefined) ?? "unknown";
    const ipAddress = getClientIp(req);

    await db.insert(documentAccessLogTable).values({
      objectPath,
      accessedBy,
      role,
      ipAddress,
    });
  } catch (err) {
    log.error({ err }, "Failed to write document access log");
  }
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", requireSuperAdmin, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

const SIGNED_URL_TTL_SECONDS = 60;

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 *
 * Two modes:
 *   1. ?signed=true  — Requires Bearer auth. Returns a JSON { url } with a
 *      short-lived signed URL that can be opened directly (no auth header needed).
 *   2. ?sig=TOKEN    — Validates the signed token and streams the file without
 *      requiring a Bearer auth header. Returns 403 if the token is expired or invalid.
 *   3. (default)     — Requires Bearer auth and streams the file directly.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  const raw = req.params.path;
  const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
  const objectPath = `/objects/${wildcardPath}`;

  const { signed, sig } = req.query as { signed?: string; sig?: string };

  if (sig) {
    const claims = verifyToken(sig);
    if (
      !claims ||
      claims.purpose !== "signed_object_url" ||
      claims.path !== objectPath
    ) {
      res.status(403).json({ error: "Forbidden: invalid or expired signed URL" });
      return;
    }

    try {
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const response = await objectStorageService.downloadObject(objectFile);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", "attachment");
      res.setHeader("X-Content-Type-Options", "nosniff");

      res.on("finish", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          void logDocumentAccess(req, objectPath);
        }
      });

      if (response.body) {
        const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        log.warn({ err: error }, "Object not found");
        res.status(404).json({ error: "Object not found" });
        return;
      }
      log.error({ err: error }, "Error serving object");
      res.status(500).json({ error: "Failed to serve object" });
    }
    return;
  }

  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized: missing token" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload || payload.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden: super_admin role required" });
    return;
  }

  if (signed === "true") {
    try {
      const sigToken = signToken(
        { purpose: "signed_object_url", path: objectPath },
        SIGNED_URL_TTL_SECONDS,
      );
      const url = `/api/storage/objects/${wildcardPath}?sig=${encodeURIComponent(sigToken)}`;
      res.json({ url });
    } catch (error) {
      log.error({ err: error }, "Error generating signed URL");
      res.status(500).json({ error: "Failed to generate signed URL" });
    }
    return;
  }

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", "attachment");
    res.setHeader("X-Content-Type-Options", "nosniff");

    res.on("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        void logDocumentAccess(req, objectPath);
      }
    });

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
