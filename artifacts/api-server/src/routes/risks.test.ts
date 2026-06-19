import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Fixed signing secret so we mint real session tokens through the production
// signing/verifying code path instead of bypassing auth.
const TEST_SIGNING_SECRET = "risks-test-signing-secret-0001";
vi.mock("../lib/token-secret.js", () => ({
  getTokenSigningSecret: () => TEST_SIGNING_SECRET,
}));

import { db, clinicsTable, risksTable, teamTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, requireClinicAccess } from "../middleware/auth";
import risksRouter from "./risks";

// Mirror the production mount: `router.use(requireClinicAccess, risksRouter)`.
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", requireClinicAccess, risksRouter);
  return app;
}

const app = buildApp();

const suffix = randomUUID().slice(0, 8);
const gestorEmail = `gestor-${suffix}@example.com`;
let clinicId: string;

function superAdminToken(): string {
  return signToken({ role: "super_admin", sub: "tester" });
}

function teamMemberToken(): string {
  return signToken({
    role: "team_member",
    sub: gestorEmail,
    email: gestorEmail,
    nome: "Gestor Teste",
    v: 2,
  });
}

async function createRisk(): Promise<string> {
  const res = await request(app)
    .post(`/api/clinics/${clinicId}/risks`)
    .set("Authorization", `Bearer ${superAdminToken()}`)
    .send({ nome: "Risco Teste", probabilidade: 3, impacto: 4 });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

beforeAll(async () => {
  const [clinic] = await db
    .insert(clinicsTable)
    .values({ nome: `Risks Test Clinic ${suffix}`, cnpj: `risks-${suffix}` })
    .returning();
  clinicId = clinic.id;

  // A team_member WITH platform access to the clinic — passes requireClinicAccess
  // so we can assert the route-level super_admin guard (403), not a 403 from the
  // mount middleware.
  await db.insert(teamTable).values({
    clinicId,
    nome: "Gestor Teste",
    email: gestorEmail,
    temAcessoPlataforma: true,
  });
});

afterAll(async () => {
  // Cascade removes risks + team rows tied to this clinic.
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicId));
});

describe("PATCH /api/risks/:id — 'Não aceito' justification invariant", () => {
  it("rejects status='nao_aceito' without a justification (400)", async () => {
    const id = await createRisk();
    const res = await request(app)
      .patch(`/api/risks/${id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "nao_aceito" });

    expect(res.status).toBe(400);

    const [row] = await db.select().from(risksTable).where(eq(risksTable.id, id));
    expect(row.status).not.toBe("nao_aceito");
    expect(row.statusJustificativa).toBeNull();
  });

  it("rejects status='nao_aceito' with a blank/whitespace justification (400)", async () => {
    const id = await createRisk();
    const res = await request(app)
      .patch(`/api/risks/${id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "nao_aceito", statusJustificativa: "   " });

    expect(res.status).toBe(400);
  });

  it("persists a trimmed justification when status='nao_aceito'", async () => {
    const id = await createRisk();
    const res = await request(app)
      .patch(`/api/risks/${id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "nao_aceito", statusJustificativa: "  Custo inviável agora  " });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("nao_aceito");
    expect(res.body.statusJustificativa).toBe("Custo inviável agora");
  });

  it("clears the justification when moving away from 'nao_aceito'", async () => {
    const id = await createRisk();
    await request(app)
      .patch(`/api/risks/${id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "nao_aceito", statusJustificativa: "motivo" })
      .expect(200);

    const res = await request(app)
      .patch(`/api/risks/${id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "mitigado" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("mitigado");
    expect(res.body.statusJustificativa).toBeNull();

    const [row] = await db.select().from(risksTable).where(eq(risksTable.id, id));
    expect(row.statusJustificativa).toBeNull();
  });
});

describe("POST generate-risks — super_admin only", () => {
  it("returns 403 on /preview for a team_member with clinic access", async () => {
    const res = await request(app)
      .post(`/api/clinics/${clinicId}/diagnostics/${randomUUID()}/generate-risks/preview`)
      .set("Authorization", `Bearer ${teamMemberToken()}`)
      .send({});

    expect(res.status).toBe(403);
  });

  it("returns 403 on /commit for a team_member with clinic access", async () => {
    const res = await request(app)
      .post(`/api/clinics/${clinicId}/diagnostics/${randomUUID()}/generate-risks/commit`)
      .set("Authorization", `Bearer ${teamMemberToken()}`)
      .send({ risks: [] });

    expect(res.status).toBe(403);
  });
});
