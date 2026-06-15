import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

// Fixed signing secret so we mint/verify real signed-object tokens through the
// production code path instead of bypassing token verification.
const TEST_SIGNING_SECRET = "storage-disposition-test-secret-0001";
vi.mock("../lib/token-secret.js", () => ({
  getTokenSigningSecret: () => TEST_SIGNING_SECRET,
}));

// Lets each test control the upstream (stored) content-type that the serving
// route inspects when deciding whether inline rendering is safe.
const { storageState } = vi.hoisted(() => ({
  storageState: { contentType: "application/pdf" },
}));

vi.mock("../lib/objectStorage", () => {
  class ObjectNotFoundError extends Error {
    constructor() {
      super("Object not found");
      this.name = "ObjectNotFoundError";
    }
  }
  class ObjectStorageService {
    async getObjectEntityFile(objectPath: string): Promise<{ path: string }> {
      return { path: objectPath };
    }
    async downloadObject(): Promise<Response> {
      return new Response("file-bytes", {
        headers: { "content-type": storageState.contentType },
      });
    }
  }
  const inlineSafe = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/webp",
    "image/bmp",
  ]);
  const isInlineSafeContentType = (mime: string | null | undefined) =>
    !!mime && inlineSafe.has(mime.split(";")[0].trim().toLowerCase());
  return { ObjectStorageService, ObjectNotFoundError, isInlineSafeContentType };
});

import { signToken } from "../middleware/auth";
import storageRouter from "./storage";

function buildApp(): Express {
  const app = express();
  app.use("/api", storageRouter);
  return app;
}

const app = buildApp();

const WILDCARD = "uploads/disposition-test-file";
const OBJECT_PATH = `/objects/${WILDCARD}`;

function signedUrl(inline: boolean): string {
  const sig = signToken(
    { purpose: "signed_object_url", path: OBJECT_PATH },
    60,
  );
  const base = `/api/storage/objects/${WILDCARD}?sig=${encodeURIComponent(sig)}`;
  return inline ? `${base}&disposition=inline` : base;
}

beforeAll(() => {
  storageState.contentType = "application/pdf";
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("GET /api/storage/objects/* — inline disposition gate", () => {
  it("serves a PDF inline when disposition=inline is requested", async () => {
    storageState.contentType = "application/pdf";
    const res = await request(app).get(signedUrl(true));

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toBe("inline");
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("serves a raster image inline when requested", async () => {
    storageState.contentType = "image/png";
    const res = await request(app).get(signedUrl(true));

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toBe("inline");
    expect(res.headers["content-type"]).toContain("image/png");
  });

  it("forces attachment for HTML even if inline is requested (no stored XSS)", async () => {
    storageState.contentType = "text/html";
    const res = await request(app).get(signedUrl(true));

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toBe("attachment");
    expect(res.headers["content-type"]).toContain("application/octet-stream");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("forces attachment for SVG even if inline is requested (no stored XSS)", async () => {
    storageState.contentType = "image/svg+xml";
    const res = await request(app).get(signedUrl(true));

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toBe("attachment");
    expect(res.headers["content-type"]).toContain("application/octet-stream");
  });

  it("defaults to attachment for a PDF when inline is not requested", async () => {
    storageState.contentType = "application/pdf";
    const res = await request(app).get(signedUrl(false));

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toBe("attachment");
    expect(res.headers["content-type"]).toContain("application/octet-stream");
  });
});
