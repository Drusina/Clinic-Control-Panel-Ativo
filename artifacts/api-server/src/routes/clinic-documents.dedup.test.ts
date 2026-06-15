import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Fixed signing secret so we mint real session tokens through the production
// signing/verifying code path instead of bypassing auth.
const TEST_SIGNING_SECRET = "clinic-documents-dedup-test-secret-0001";
vi.mock("../lib/token-secret.js", () => ({
  getTokenSigningSecret: () => TEST_SIGNING_SECRET,
}));

// Stub object storage so uploads never touch GCS. The dedup check runs BEFORE
// the upload, so the storage path is only exercised on non-duplicate writes.
vi.mock("../lib/objectStorage.js", () => {
  class ObjectNotFoundError extends Error {
    constructor() {
      super("Object not found");
      this.name = "ObjectNotFoundError";
    }
  }
  class ObjectStorageService {
    async getObjectEntityUploadURL(): Promise<string> {
      return `https://storage.example/upload/obj-${randomUUID()}`;
    }
    normalizeObjectEntityPath(url: string): string {
      return `/objects/uploads/${url.split("/").pop()}`;
    }
    async getObjectEntityFile(): Promise<{ download: () => Promise<[Buffer]> }> {
      return { download: async () => [Buffer.from("file-bytes")] };
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

// Control the AI title suggester deterministically.
const { suggestDocumentTitleMock } = vi.hoisted(() => ({
  suggestDocumentTitleMock: vi.fn(),
}));
vi.mock("../lib/documentTitleSuggester.js", () => ({
  suggestDocumentTitle: suggestDocumentTitleMock,
  cleanFileNameAsTitle: (name: string) =>
    name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim(),
  isTitleSuggestableMimeType: (mime: string | null | undefined) =>
    mime === "application/pdf" || (mime ?? "").startsWith("text/"),
}));

import {
  db,
  clinicsTable,
  documentCategoriesTable,
  clinicDocumentsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, requireClinicAccess } from "../middleware/auth";
import clinicDocumentsRouter from "./clinic-documents";

// Mirror the production mount: `router.use(requireClinicAccess, clinicDocumentsRouter)`.
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", requireClinicAccess, clinicDocumentsRouter);
  return app;
}

const app = buildApp();

const suffix = randomUUID().slice(0, 8);
let clinicId: string;
let categoryId: string;

function superAdminToken(): string {
  return signToken({ role: "super_admin", sub: "tester" });
}

beforeAll(async () => {
  const [clinic] = await db
    .insert(clinicsTable)
    .values({ nome: `Docs Dedup Clinic ${suffix}`, cnpj: `docs-dedup-${suffix}` })
    .returning();
  clinicId = clinic.id;
  const [cat] = await db
    .insert(documentCategoriesTable)
    .values({ clinicId, name: "Contratos" })
    .returning();
  categoryId = cat.id;

  // The storage PUT during a real (non-duplicate) upload — always succeeds.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, text: async () => "" })),
  );
});

afterAll(async () => {
  // Cascade removes categories + documents tied to this clinic.
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicId));
  vi.unstubAllGlobals();
});

beforeEach(() => {
  suggestDocumentTitleMock.mockReset();
});

describe("POST /api/clinics/:clinicId/documents — duplicate detection", () => {
  it("rejects an identical re-upload with 409 and returns the original document", async () => {
    const bytes = Buffer.from(`unique-contract-${suffix}-A`);

    const first = await request(app)
      .post(`/api/clinics/${clinicId}/documents`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .field("categoryId", categoryId)
      .attach("file", bytes, { filename: "contrato.pdf", contentType: "application/pdf" });
    expect(first.status).toBe(201);
    const originalId = first.body.id as string;

    const dup = await request(app)
      .post(`/api/clinics/${clinicId}/documents`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .field("categoryId", categoryId)
      .attach("file", bytes, { filename: "outro-nome.pdf", contentType: "application/pdf" });

    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatch(/já foi enviado/i);
    expect(dup.body.duplicateOf?.id).toBe(originalId);
    expect(typeof dup.body.duplicateOf?.sequenceNumber).toBe("number");
  });

  it("allows the duplicate through when allowDuplicate=true", async () => {
    const bytes = Buffer.from(`unique-contract-${suffix}-B`);

    const first = await request(app)
      .post(`/api/clinics/${clinicId}/documents`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .field("categoryId", categoryId)
      .attach("file", bytes, { filename: "b.pdf", contentType: "application/pdf" });
    expect(first.status).toBe(201);

    const override = await request(app)
      .post(`/api/clinics/${clinicId}/documents`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .field("categoryId", categoryId)
      .field("allowDuplicate", "true")
      .attach("file", bytes, { filename: "b.pdf", contentType: "application/pdf" });

    expect(override.status).toBe(201);
    expect(override.body.id).not.toBe(first.body.id);

    const rows = await db
      .select()
      .from(clinicDocumentsTable)
      .where(eq(clinicDocumentsTable.clinicId, clinicId));
    const sameHash = rows.filter((r) => r.contentHash === first.body.contentHash);
    expect(sameHash.length).toBe(2);
  });
});

describe("POST /api/clinics/:clinicId/documents/:id/suggest-title", () => {
  it("applies the AI title and reports source 'ai'", async () => {
    const bytes = Buffer.from(`title-doc-${suffix}-AI`);
    const up = await request(app)
      .post(`/api/clinics/${clinicId}/documents`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .field("categoryId", categoryId)
      .attach("file", bytes, { filename: "scan_001.pdf", contentType: "application/pdf" });
    expect(up.status).toBe(201);

    suggestDocumentTitleMock.mockResolvedValueOnce({
      title: "Contrato Social — ACME LTDA — 2026",
      source: "ai",
    });

    const res = await request(app)
      .post(`/api/clinics/${clinicId}/documents/${up.body.id}/suggest-title`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.source).toBe("ai");
    expect(res.body.title).toBe("Contrato Social — ACME LTDA — 2026");
    expect(res.body.document.title).toBe("Contrato Social — ACME LTDA — 2026");
  });

  it("falls back to a cleaned filename when the AI call fails", async () => {
    const bytes = Buffer.from(`title-doc-${suffix}-FALLBACK`);
    const up = await request(app)
      .post(`/api/clinics/${clinicId}/documents`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .field("categoryId", categoryId)
      .attach("file", bytes, { filename: "balanco_2025.pdf", contentType: "application/pdf" });
    expect(up.status).toBe(201);

    suggestDocumentTitleMock.mockRejectedValueOnce(new Error("AI provider down"));

    const res = await request(app)
      .post(`/api/clinics/${clinicId}/documents/${up.body.id}/suggest-title`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.source).toBe("filename");
    expect(res.body.title).toBe("balanco 2025");
  });
});

describe("GET /api/clinics/:clinicId/documents/:id/signed-url — preview disposition", () => {
  it("requests inline rendering for preview-friendly types (PDF)", async () => {
    const bytes = Buffer.from(`signed-pdf-${suffix}`);
    const up = await request(app)
      .post(`/api/clinics/${clinicId}/documents`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .field("categoryId", categoryId)
      .attach("file", bytes, { filename: "preview.pdf", contentType: "application/pdf" });
    expect(up.status).toBe(201);

    const res = await request(app)
      .get(`/api/clinics/${clinicId}/documents/${up.body.id}/signed-url`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.url).toContain("disposition=inline");
  });

  it("omits inline for types that must download (e.g. zip)", async () => {
    const bytes = Buffer.from(`signed-zip-${suffix}`);
    const up = await request(app)
      .post(`/api/clinics/${clinicId}/documents`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .field("categoryId", categoryId)
      .attach("file", bytes, { filename: "backup.zip", contentType: "application/zip" });
    expect(up.status).toBe(201);

    const res = await request(app)
      .get(`/api/clinics/${clinicId}/documents/${up.body.id}/signed-url`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.url).not.toContain("disposition=inline");
  });
});

describe("PATCH /api/clinics/:clinicId/documents/:id — manual rename", () => {
  it("persists a trimmed title and rejects empty titles", async () => {
    const bytes = Buffer.from(`rename-doc-${suffix}`);
    const up = await request(app)
      .post(`/api/clinics/${clinicId}/documents`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .field("categoryId", categoryId)
      .attach("file", bytes, { filename: "rename.pdf", contentType: "application/pdf" });
    expect(up.status).toBe(201);

    const ok = await request(app)
      .patch(`/api/clinics/${clinicId}/documents/${up.body.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ title: "  Nome Manual Definido  " });
    expect(ok.status).toBe(200);
    expect(ok.body.title).toBe("Nome Manual Definido");

    const empty = await request(app)
      .patch(`/api/clinics/${clinicId}/documents/${up.body.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ title: "   " });
    expect(empty.status).toBe(400);
  });
});
