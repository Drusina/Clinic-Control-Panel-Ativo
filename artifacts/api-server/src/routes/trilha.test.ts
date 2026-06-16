import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Fixed signing secret so we mint real session tokens through the production
// signing/verifying code path instead of bypassing auth.
const TEST_SIGNING_SECRET = "trilha-test-signing-secret-0001";
vi.mock("../lib/token-secret.js", () => ({
  getTokenSigningSecret: () => TEST_SIGNING_SECRET,
}));

import { db, clinicsTable, trilhaEtapasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, requireClinicAccess } from "../middleware/auth";
import trilhaRouter from "./trilha";
import { backfillTrilha } from "../lib/trilha";

// Mirror the production mount: `router.use(requireClinicAccess, trilhaRouter)`.
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", requireClinicAccess, trilhaRouter);
  return app;
}

const app = buildApp();
const suffix = randomUUID().slice(0, 8);
let clinicId: string;
let backfillClinicId: string;

function superAdminToken(): string {
  return signToken({ role: "super_admin", sub: "tester" });
}

beforeAll(async () => {
  const [c1] = await db
    .insert(clinicsTable)
    .values({ nome: `Trilha Test Clinic ${suffix}`, cnpj: `trilha-${suffix}` })
    .returning();
  clinicId = c1.id;
  const [c2] = await db
    .insert(clinicsTable)
    .values({ nome: `Trilha Backfill Clinic ${suffix}`, cnpj: `trilha-bf-${suffix}` })
    .returning();
  backfillClinicId = c2.id;
});

afterAll(async () => {
  await db.delete(trilhaEtapasTable).where(eq(trilhaEtapasTable.clinicId, clinicId));
  await db
    .delete(trilhaEtapasTable)
    .where(eq(trilhaEtapasTable.clinicId, backfillClinicId));
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicId));
  await db.delete(clinicsTable).where(eq(clinicsTable.id, backfillClinicId));
});

describe("Trilha de Implementação — hybrid progression (never auto-conclude)", () => {
  it("GET materializes all 15 stages as pendente with zero progress, even when the suggestion engine flags stages 'pronto'", async () => {
    const res = await request(app)
      .get(`/api/clinics/${clinicId}/trilha`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    const { etapas, resumo } = res.body;

    // Every stage materialized, none concluded by the system.
    expect(etapas).toHaveLength(15);
    expect(etapas.every((e: { status: string }) => e.status === "pendente")).toBe(true);
    expect(etapas.some((e: { confirmadoPor?: string | null }) => e.confirmadoPor)).toBe(false);
    expect(resumo).toMatchObject({ etapa: 1, progresso: 0, resolvidas: 0, total: 15 });

    // The suggestion engine still runs (a bare clinic already satisfies
    // `pre_cadastro`) — but a suggested-ready stage stays pendente: suggesting
    // "pronto" must never imply auto-conclusion.
    const preCadastro = etapas.find((e: { key: string }) => e.key === "pre_cadastro");
    expect(preCadastro.sugestao?.pronto).toBe(true);
    expect(preCadastro.status).toBe("pendente");
  });

  it("backfillTrilha seeds 15 pendente rows and never writes a concluido/confirmed row", async () => {
    await backfillTrilha();

    const rows = await db
      .select()
      .from(trilhaEtapasTable)
      .where(eq(trilhaEtapasTable.clinicId, backfillClinicId));

    expect(rows).toHaveLength(15);
    expect(rows.every((r) => r.status === "pendente")).toBe(true);
    expect(rows.some((r) => r.confirmadoPor)).toBe(false);
    expect(rows.some((r) => r.dataConcluida)).toBe(false);
  });

  it("PATCH is the only path that concludes a stage and recomputes clinics.etapa/progresso", async () => {
    const patch = await request(app)
      .patch(`/api/clinics/${clinicId}/trilha/pre_cadastro`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "concluido" });
    expect(patch.status).toBe(200);

    const res = await request(app)
      .get(`/api/clinics/${clinicId}/trilha`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    const { etapas, resumo } = res.body;

    const preCadastro = etapas.find((e: { key: string }) => e.key === "pre_cadastro");
    expect(preCadastro.status).toBe("concluido");
    expect(preCadastro.confirmadoPor).toBeTruthy();
    expect(resumo).toMatchObject({ etapa: 2, progresso: 7, resolvidas: 1 });

    // The conclusion is recomputed transactionally onto the clinic record.
    const [clinic] = await db
      .select()
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId));
    expect(clinic.etapa).toBe(2);
    expect(clinic.progresso).toBe(7);
  });

  it("rejects an unknown etapaKey with 400", async () => {
    const res = await request(app)
      .patch(`/api/clinics/${clinicId}/trilha/bogus`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "concluido" });
    expect(res.status).toBe(400);
  });
});
