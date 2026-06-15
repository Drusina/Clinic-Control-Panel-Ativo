import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Fixed signing secret so we mint real session tokens through the production
// signing/verifying code path instead of bypassing auth.
const TEST_SIGNING_SECRET = "kickoffs-test-signing-secret-0001";
vi.mock("../lib/token-secret.js", () => ({
  getTokenSigningSecret: () => TEST_SIGNING_SECRET,
}));

import { db, clinicsTable, kickoffsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, requireClinicAccess } from "../middleware/auth";
import kickoffsRouter from "./kickoffs";

// Mirror the production mount: `router.use(requireClinicAccess, kickoffsRouter)`.
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", requireClinicAccess, kickoffsRouter);
  return app;
}

const app = buildApp();

const suffix = randomUUID().slice(0, 8);
let clinicId: string;

function superAdminToken(): string {
  return signToken({ role: "super_admin", sub: "tester" });
}

beforeAll(async () => {
  const [clinic] = await db
    .insert(clinicsTable)
    .values({ nome: `Kickoff Test Clinic ${suffix}`, cnpj: `kickoff-${suffix}` })
    .returning();
  clinicId = clinic.id;
});

afterAll(async () => {
  // Cascade removes the kickoff row tied to this clinic.
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicId));
});

describe("PUT /api/clinics/:clinicId/kickoff", () => {
  it("creates a kickoff with empty optional fields without a 500 (modalidade/status persist)", async () => {
    const res = await request(app)
      .put(`/api/clinics/${clinicId}/kickoff`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({
        // Empty date + duration is exactly what the form sends by default and
        // used to crash the whole upsert (HTTP 500), losing the selections.
        dataRealizacao: "",
        duracaoMinutos: "",
        modalidade: "presencial",
        facilitador: "",
        status: "validado",
      });

    expect(res.status).toBe(200);
    expect(res.body.modalidade).toBe("presencial");
    expect(res.body.status).toBe("validado");
    expect(res.body.dataRealizacao).toBeNull();
    expect(res.body.duracaoMinutos).toBeNull();
    expect(res.body.facilitador).toBeNull();

    const [row] = await db.select().from(kickoffsTable).where(eq(kickoffsTable.clinicId, clinicId));
    expect(row.modalidade).toBe("presencial");
    expect(row.status).toBe("validado");
    expect(row.dataRealizacao).toBeNull();
  });

  it("updates modalidade/status with empty optional fields and round-trips via GET", async () => {
    const putRes = await request(app)
      .put(`/api/clinics/${clinicId}/kickoff`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({
        dataRealizacao: "",
        duracaoMinutos: "",
        modalidade: "hibrido",
        facilitador: "",
        status: "realizado",
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.modalidade).toBe("hibrido");
    expect(putRes.body.status).toBe("realizado");

    const getRes = await request(app)
      .get(`/api/clinics/${clinicId}/kickoff`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.modalidade).toBe("hibrido");
    expect(getRes.body.status).toBe("realizado");
  });

  it("persists a filled date and duration when provided", async () => {
    const res = await request(app)
      .put(`/api/clinics/${clinicId}/kickoff`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({
        dataRealizacao: "2026-04-27",
        duracaoMinutos: 90,
        modalidade: "remoto",
        facilitador: "RAFAEL",
        status: "validado",
      });

    expect(res.status).toBe(200);
    expect(res.body.dataRealizacao).toBe("2026-04-27");
    expect(res.body.duracaoMinutos).toBe(90);
    expect(res.body.facilitador).toBe("RAFAEL");
  });

  it("rejects an invalid date with 400 (not 500)", async () => {
    const res = await request(app)
      .put(`/api/clinics/${clinicId}/kickoff`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ dataRealizacao: "not-a-date", status: "rascunho" });

    expect(res.status).toBe(400);
  });

  it("rejects an impossible calendar date with 400 (not 500)", async () => {
    const res = await request(app)
      .put(`/api/clinics/${clinicId}/kickoff`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ dataRealizacao: "2026-02-30", status: "rascunho" });

    expect(res.status).toBe(400);
  });
});
