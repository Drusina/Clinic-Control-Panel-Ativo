import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Fixed signing secret so we mint real session tokens through the production
// signing/verifying code path instead of bypassing auth.
const TEST_SIGNING_SECRET = "compromissos-test-signing-secret-1";
vi.mock("../lib/token-secret.js", () => ({
  getTokenSigningSecret: () => TEST_SIGNING_SECRET,
}));

import { db, clinicsTable, compromissosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, requireClinicAccess } from "../middleware/auth";
import compromissosRouter from "./compromissos";

// Mirror the production mount exactly: `router.use(requireClinicAccess, …)`.
// For a super_admin token requireClinicAccess attaches `req.user` and calls
// next(), so the id-based routes can resolve the row then assertClinicAccess.
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", requireClinicAccess, compromissosRouter);
  return app;
}

const app = buildApp();
const suffix = randomUUID().slice(0, 8);
let clinicId: string;

function superAdminToken(): string {
  return signToken({ role: "super_admin", sub: "tester" });
}

const auth = () => ({ Authorization: `Bearer ${superAdminToken()}` });

beforeAll(async () => {
  const [clinic] = await db
    .insert(clinicsTable)
    .values({ nome: `Compromisso Test Clinic ${suffix}`, cnpj: `compr-${suffix}` })
    .returning();
  clinicId = clinic.id;
});

afterAll(async () => {
  await db.delete(compromissosTable).where(eq(compromissosTable.clinicId, clinicId));
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicId));
});

async function createCompromisso(body: Record<string, unknown>) {
  return request(app)
    .post(`/api/clinics/${clinicId}/compromissos`)
    .set(auth())
    .send(body);
}

describe("compromissos CRUD validation", () => {
  it("rejects creation when fim < inicio (400)", async () => {
    const res = await createCompromisso({
      titulo: "Janela inválida",
      inicio: "2026-07-01T14:00:00.000Z",
      fim: "2026-07-01T13:00:00.000Z",
    });
    expect(res.status).toBe(400);
  });

  it("rejects PATCH that moves inicio past an existing (unchanged) fim (400)", async () => {
    const created = await createCompromisso({
      titulo: "Reunião válida",
      inicio: "2026-07-02T14:00:00.000Z",
      fim: "2026-07-02T15:00:00.000Z",
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    // Move only `inicio` to AFTER the stored `fim` — fim is omitted from the
    // payload, so the regression was that the server skipped validation.
    const patched = await request(app)
      .patch(`/api/compromissos/${id}`)
      .set(auth())
      .send({ inicio: "2026-07-02T16:00:00.000Z" });
    expect(patched.status).toBe(400);

    // The stored row must be untouched.
    const [row] = await db
      .select()
      .from(compromissosTable)
      .where(eq(compromissosTable.id, id));
    expect(row.inicio.toISOString()).toBe("2026-07-02T14:00:00.000Z");
  });

  it("allows PATCH that moves inicio when fim is widened in the same request", async () => {
    const created = await createCompromisso({
      titulo: "Reunião reagendada",
      inicio: "2026-07-03T14:00:00.000Z",
      fim: "2026-07-03T15:00:00.000Z",
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const patched = await request(app)
      .patch(`/api/compromissos/${id}`)
      .set(auth())
      .send({ inicio: "2026-07-03T16:00:00.000Z", fim: "2026-07-03T17:00:00.000Z" });
    expect(patched.status).toBe(200);
    expect(patched.body.inicio).toBe("2026-07-03T16:00:00.000Z");
    expect(patched.body.fim).toBe("2026-07-03T17:00:00.000Z");
  });

  it("re-arms the reminder when inicio changes on a scheduled appointment", async () => {
    const created = await createCompromisso({
      titulo: "Com lembrete",
      inicio: "2026-07-04T14:00:00.000Z",
      status: "agendado",
      lembreteMinutosAntes: 60,
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    // Simulate a reminder already having fired.
    await db
      .update(compromissosTable)
      .set({ lembreteEnviadoEm: new Date() })
      .where(eq(compromissosTable.id, id));

    const patched = await request(app)
      .patch(`/api/compromissos/${id}`)
      .set(auth())
      .send({ inicio: "2026-07-05T14:00:00.000Z" });
    expect(patched.status).toBe(200);

    const [row] = await db
      .select()
      .from(compromissosTable)
      .where(eq(compromissosTable.id, id));
    expect(row.lembreteEnviadoEm).toBeNull();
  });
});
