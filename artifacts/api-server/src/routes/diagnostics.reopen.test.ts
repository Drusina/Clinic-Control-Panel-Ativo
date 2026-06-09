import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Use a fixed, deterministic signing secret so we can mint real session tokens
// with the production signing/verifying code path instead of bypassing auth.
const TEST_SIGNING_SECRET = "diagnostics-reopen-test-signing-secret-0001";
vi.mock("../lib/token-secret.js", () => ({
  getTokenSigningSecret: () => TEST_SIGNING_SECRET,
}));

import {
  db,
  clinicsTable,
  diagnosticsTable,
  teamTable,
} from "@workspace/db";
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
const authorizedEmail = `reopen-authorized-${suffix}@example.com`;
const unauthorizedEmail = `reopen-unauthorized-${suffix}@example.com`;

let clinicId: string;
let otherClinicId: string;
let diagnosticId: string;

function superAdminToken(): string {
  return signToken({ role: "super_admin", sub: "tester" });
}

function teamMemberToken(email: string): string {
  return signToken({ role: "team_member", sub: email, email, nome: "Tester" });
}

beforeAll(async () => {
  const [clinic] = await db
    .insert(clinicsTable)
    .values({ nome: `Reopen Test Clinic ${suffix}`, cnpj: `reopen-${suffix}-a` })
    .returning();
  clinicId = clinic.id;

  const [otherClinic] = await db
    .insert(clinicsTable)
    .values({ nome: `Reopen Other Clinic ${suffix}`, cnpj: `reopen-${suffix}-b` })
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
  // valid session token yet must not be able to reopen this clinic's diagnostic.
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

async function seedConcludedDiagnostic(): Promise<string> {
  const [diag] = await db
    .insert(diagnosticsTable)
    .values({ clinicId, status: "concluido", concluidoEm: new Date() })
    .returning();
  return diag.id;
}

describe("POST /api/diagnostics/:id/reopen", () => {
  it("rejects requests without a session token (401)", async () => {
    diagnosticId = await seedConcludedDiagnostic();
    const res = await request(app).post(`/api/diagnostics/${diagnosticId}/reopen`);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the diagnostic does not exist", async () => {
    const missingId = randomUUID();
    const res = await request(app)
      .post(`/api/diagnostics/${missingId}/reopen`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(res.status).toBe(404);
  });

  it("rejects a team member without access to the clinic (403)", async () => {
    diagnosticId = await seedConcludedDiagnostic();
    const res = await request(app)
      .post(`/api/diagnostics/${diagnosticId}/reopen`)
      .set("Authorization", `Bearer ${teamMemberToken(unauthorizedEmail)}`);
    expect(res.status).toBe(403);

    // The diagnostic must remain concluded — a rejected request changes nothing.
    const [unchanged] = await db
      .select()
      .from(diagnosticsTable)
      .where(eq(diagnosticsTable.id, diagnosticId));
    expect(unchanged.status).toBe("concluido");
    expect(unchanged.concluidoEm).not.toBeNull();
  });

  it("lets an authorized team member reopen the diagnostic (em_andamento + concluidoEm cleared)", async () => {
    diagnosticId = await seedConcludedDiagnostic();
    const res = await request(app)
      .post(`/api/diagnostics/${diagnosticId}/reopen`)
      .set("Authorization", `Bearer ${teamMemberToken(authorizedEmail)}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("em_andamento");
    expect(res.body.concluidoEm).toBeNull();

    const [reloaded] = await db
      .select()
      .from(diagnosticsTable)
      .where(eq(diagnosticsTable.id, diagnosticId));
    expect(reloaded.status).toBe("em_andamento");
    expect(reloaded.concluidoEm).toBeNull();
  });

  it("lets a super admin reopen any clinic's diagnostic", async () => {
    diagnosticId = await seedConcludedDiagnostic();
    const res = await request(app)
      .post(`/api/diagnostics/${diagnosticId}/reopen`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("em_andamento");
  });
});
