import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Use a fixed, deterministic signing secret so we can mint real session tokens
// with the production signing/verifying code path instead of bypassing auth.
const TEST_SIGNING_SECRET = "diagnostics-complete-test-signing-secret-0001";
vi.mock("../lib/token-secret.js", () => ({
  getTokenSigningSecret: () => TEST_SIGNING_SECRET,
}));

import {
  db,
  clinicsTable,
  diagnosticsTable,
  teamTable,
  perguntasTable,
  respostasTable,
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

const suffix = randomUUID().slice(0, 8);
const authorizedEmail = `complete-authorized-${suffix}@example.com`;
const unauthorizedEmail = `complete-unauthorized-${suffix}@example.com`;

let clinicId: string;
let otherClinicId: string;
let allPerguntaIds: string[] = [];

function superAdminToken(): string {
  return signToken({ role: "super_admin", sub: "tester" });
}

function teamMemberToken(email: string): string {
  return signToken({ role: "team_member", sub: email, email, nome: "Tester" });
}

async function seedDiagnostic(): Promise<string> {
  const [diag] = await db
    .insert(diagnosticsTable)
    .values({ clinicId, status: "em_andamento" })
    .returning();
  return diag.id;
}

// Answers `count` (or all) of the global question bank for the given diagnostic.
// `valor` is irrelevant to the completion gate (which only counts responses), so
// a constant is fine; recalculateScores tolerates values it cannot score.
async function answerQuestions(diagnosticId: string, count?: number): Promise<void> {
  const ids = count == null ? allPerguntaIds : allPerguntaIds.slice(0, count);
  if (ids.length === 0) return;
  await db
    .insert(respostasTable)
    .values(ids.map((perguntaId) => ({ diagnosticoId: diagnosticId, perguntaId, valor: "sim" })))
    .onConflictDoNothing();
}

beforeAll(async () => {
  const [clinic] = await db
    .insert(clinicsTable)
    .values({ nome: `Complete Test Clinic ${suffix}`, cnpj: `complete-${suffix}-a` })
    .returning();
  clinicId = clinic.id;

  const [otherClinic] = await db
    .insert(clinicsTable)
    .values({ nome: `Complete Other Clinic ${suffix}`, cnpj: `complete-${suffix}-b` })
    .returning();
  otherClinicId = otherClinic.id;

  // Authorized: team member of `clinicId` with platform access.
  await db.insert(teamTable).values({
    clinicId,
    nome: "Authorized Member",
    email: authorizedEmail,
    temAcessoPlataforma: true,
  });

  // Unauthorized: a real team member, but of a DIFFERENT clinic.
  await db.insert(teamTable).values({
    clinicId: otherClinicId,
    nome: "Unauthorized Member",
    email: unauthorizedEmail,
    temAcessoPlataforma: true,
  });

  const perguntas = await db.select({ id: perguntasTable.id }).from(perguntasTable);
  allPerguntaIds = perguntas.map((p) => p.id);
});

afterAll(async () => {
  // Cascades remove diagnostics + respostas + team rows tied to these clinics.
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicId));
  await db.delete(clinicsTable).where(eq(clinicsTable.id, otherClinicId));
});

describe("POST /api/diagnostics/:id/complete", () => {
  it("requires a global question bank for these tests", () => {
    // The completion gate is defined against the global bank; if it is empty the
    // 100%/incomplete distinction below is meaningless, so assert it is seeded.
    expect(allPerguntaIds.length).toBeGreaterThan(0);
  });

  it("rejects requests without a session token (401)", async () => {
    const diagnosticId = await seedDiagnostic();
    const res = await request(app).post(`/api/diagnostics/${diagnosticId}/complete`);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the diagnostic does not exist", async () => {
    const missingId = randomUUID();
    const res = await request(app)
      .post(`/api/diagnostics/${missingId}/complete`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(res.status).toBe(404);
  });

  it("returns 422 when not every question is answered, leaving status unchanged", async () => {
    const diagnosticId = await seedDiagnostic();
    // Answer all but one question so the diagnostic is < 100% complete.
    await answerQuestions(diagnosticId, Math.max(0, allPerguntaIds.length - 1));

    const res = await request(app)
      .post(`/api/diagnostics/${diagnosticId}/complete`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(422);
    expect(typeof res.body.error).toBe("string");

    const [unchanged] = await db
      .select()
      .from(diagnosticsTable)
      .where(eq(diagnosticsTable.id, diagnosticId));
    expect(unchanged.status).toBe("em_andamento");
    expect(unchanged.concluidoEm).toBeNull();
  });

  it("rejects a team member without access to the clinic (403)", async () => {
    const diagnosticId = await seedDiagnostic();
    await answerQuestions(diagnosticId);

    const res = await request(app)
      .post(`/api/diagnostics/${diagnosticId}/complete`)
      .set("Authorization", `Bearer ${teamMemberToken(unauthorizedEmail)}`);
    expect(res.status).toBe(403);

    const [unchanged] = await db
      .select()
      .from(diagnosticsTable)
      .where(eq(diagnosticsTable.id, diagnosticId));
    expect(unchanged.status).toBe("em_andamento");
  });

  it("lets an authorized team member complete a fully answered diagnostic", async () => {
    const diagnosticId = await seedDiagnostic();
    await answerQuestions(diagnosticId);

    const res = await request(app)
      .post(`/api/diagnostics/${diagnosticId}/complete`)
      .set("Authorization", `Bearer ${teamMemberToken(authorizedEmail)}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("concluido");
    expect(res.body.concluidoEm).not.toBeNull();
    expect(res.body.progresso?.completo).toBe(true);

    const [reloaded] = await db
      .select()
      .from(diagnosticsTable)
      .where(eq(diagnosticsTable.id, diagnosticId));
    expect(reloaded.status).toBe("concluido");
    expect(reloaded.concluidoEm).not.toBeNull();
  });

  it("lets a super admin complete a fully answered diagnostic", async () => {
    const diagnosticId = await seedDiagnostic();
    await answerQuestions(diagnosticId);

    const res = await request(app)
      .post(`/api/diagnostics/${diagnosticId}/complete`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("concluido");
    expect(res.body.progresso?.completo).toBe(true);
  });
});
