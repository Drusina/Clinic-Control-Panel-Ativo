import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Use a fixed, deterministic signing secret so we can mint real session tokens
// with the production signing/verifying code path instead of bypassing auth.
const TEST_SIGNING_SECRET = "diagnostics-delete-test-signing-secret-0001";
vi.mock("../lib/token-secret.js", () => ({
  getTokenSigningSecret: () => TEST_SIGNING_SECRET,
}));

import { db, clinicsTable, diagnosticsTable, teamTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, requireAuth } from "../middleware/auth";
import diagnosticsRouter from "./diagnostics";

// Mirror the production mount: `router.use(requireAuth, diagnosticsRouter)`.
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", requireAuth, diagnosticsRouter);
  return app;
}

const app = buildApp();

// Unique suffix keeps seeded rows from colliding with real data in the shared
// development database and with other test runs.
const suffix = randomUUID().slice(0, 8);
const authorizedEmail = `del-authorized-${suffix}@example.com`;
const unauthorizedEmail = `del-unauthorized-${suffix}@example.com`;

let clinicId: string;
let otherClinicId: string;

function superAdminToken(): string {
  return signToken({ role: "super_admin", sub: "tester" });
}

function teamMemberToken(email: string): string {
  return signToken({ role: "team_member", sub: email, email, nome: "Tester" });
}

beforeAll(async () => {
  const [clinic] = await db
    .insert(clinicsTable)
    .values({ nome: `Del Test Clinic ${suffix}`, cnpj: `del-${suffix}-a` })
    .returning();
  clinicId = clinic.id;

  const [otherClinic] = await db
    .insert(clinicsTable)
    .values({ nome: `Del Other Clinic ${suffix}`, cnpj: `del-${suffix}-b` })
    .returning();
  otherClinicId = otherClinic.id;

  // Authorized: team member of `clinicId` with platform access.
  await db.insert(teamTable).values({
    clinicId,
    nome: "Authorized Member",
    email: authorizedEmail,
    temAcessoPlataforma: true,
  });

  // Unauthorized: a real team member, but of a DIFFERENT clinic. They have a
  // valid session token yet must not be able to delete this clinic's diagnostic.
  await db.insert(teamTable).values({
    clinicId: otherClinicId,
    nome: "Unauthorized Member",
    email: unauthorizedEmail,
    temAcessoPlataforma: true,
  });
});

afterAll(async () => {
  // Cascades remove diagnostics + team rows tied to these clinics.
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicId));
  await db.delete(clinicsTable).where(eq(clinicsTable.id, otherClinicId));
});

async function clearDiagnostics(): Promise<void> {
  await db.delete(diagnosticsTable).where(eq(diagnosticsTable.clinicId, clinicId));
}

async function seedDiagnostic(
  status: "em_andamento" | "concluido",
  versao: number,
): Promise<string> {
  const [diag] = await db
    .insert(diagnosticsTable)
    .values({
      clinicId,
      status,
      versao,
      ...(status === "concluido" ? { concluidoEm: new Date() } : {}),
    })
    .returning();
  return diag.id;
}

describe("DELETE /api/diagnostics/:id", () => {
  beforeEach(clearDiagnostics);

  it("rejects requests without a session token (401)", async () => {
    const id = await seedDiagnostic("em_andamento", 1);
    const res = await request(app).delete(`/api/diagnostics/${id}`);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the diagnostic does not exist", async () => {
    const res = await request(app)
      .delete(`/api/diagnostics/${randomUUID()}`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(res.status).toBe(404);
  });

  it("refuses to delete a concluded diagnostic (409) and keeps it", async () => {
    const id = await seedDiagnostic("concluido", 1);
    const res = await request(app)
      .delete(`/api/diagnostics/${id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(res.status).toBe(409);

    const [row] = await db
      .select()
      .from(diagnosticsTable)
      .where(eq(diagnosticsTable.id, id));
    expect(row).toBeDefined();
    expect(row.status).toBe("concluido");
  });

  it("rejects a team member without access to the clinic (403) and keeps it", async () => {
    const id = await seedDiagnostic("em_andamento", 1);
    const res = await request(app)
      .delete(`/api/diagnostics/${id}`)
      .set("Authorization", `Bearer ${teamMemberToken(unauthorizedEmail)}`);
    expect(res.status).toBe(403);

    const [row] = await db
      .select()
      .from(diagnosticsTable)
      .where(eq(diagnosticsTable.id, id));
    expect(row).toBeDefined();
  });

  it("lets an authorized team member delete an em_andamento diagnostic (204)", async () => {
    const id = await seedDiagnostic("em_andamento", 1);
    const res = await request(app)
      .delete(`/api/diagnostics/${id}`)
      .set("Authorization", `Bearer ${teamMemberToken(authorizedEmail)}`);
    expect(res.status).toBe(204);

    const rows = await db
      .select()
      .from(diagnosticsTable)
      .where(eq(diagnosticsTable.id, id));
    expect(rows).toHaveLength(0);
  });

  it("lets a super admin delete an em_andamento diagnostic (204)", async () => {
    const id = await seedDiagnostic("em_andamento", 1);
    const res = await request(app)
      .delete(`/api/diagnostics/${id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(res.status).toBe(204);

    const rows = await db
      .select()
      .from(diagnosticsTable)
      .where(eq(diagnosticsTable.id, id));
    expect(rows).toHaveLength(0);
  });
});

describe("POST /api/clinics/:clinicId/diagnostics", () => {
  beforeEach(clearDiagnostics);

  it("creates the first diagnostic as version 1, em_andamento", async () => {
    const res = await request(app)
      .post(`/api/clinics/${clinicId}/diagnostics`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(res.status).toBe(201);
    expect(res.body.versao).toBe(1);
    expect(res.body.status).toBe("em_andamento");
  });

  it("refuses to create a new diagnostic while one is em_andamento (409)", async () => {
    await seedDiagnostic("em_andamento", 1);
    const res = await request(app)
      .post(`/api/clinics/${clinicId}/diagnostics`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(res.status).toBe(409);

    // No extra diagnostic must have been created.
    const rows = await db
      .select()
      .from(diagnosticsTable)
      .where(eq(diagnosticsTable.clinicId, clinicId));
    expect(rows).toHaveLength(1);
  });

  it("numbers the next version from the max existing version, not the count", async () => {
    // A single remaining concluded diagnostic at version 3 (count=1, max=3):
    // count+1 would wrongly reuse version 2; max+1 must yield version 4. This is
    // exactly the gap left behind after deleting earlier in-progress duplicates.
    await seedDiagnostic("concluido", 3);
    const res = await request(app)
      .post(`/api/clinics/${clinicId}/diagnostics`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(res.status).toBe(201);
    expect(res.body.versao).toBe(4);
  });
});
