import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Fixed signing secret so we mint real session tokens through the production
// signing/verifying code path instead of bypassing auth.
const TEST_SIGNING_SECRET = "regenerate-all-tarefas-test-secret-0001";
vi.mock("../lib/token-secret.js", () => ({
  getTokenSigningSecret: () => TEST_SIGNING_SECRET,
}));

// The all-clinics endpoint's own responsibility is ONLY: loop over every clinic,
// call regenerateTarefasForClinic, and aggregate the per-clinic results. The
// real per-clinic regeneration (REPLACE, source-by-origin, idempotency, scoping)
// is exercised by actions.regenerate-tarefas.test.ts. We mock the per-clinic lib
// here so the global backfill never mutates real rows in the shared dev DB and
// so the aggregation math is deterministic.
const PER_CLINIC = {
  actionsProcessed: 2,
  tarefasCreated: 5,
  bySource: { modelo: 1, ia: 1, fallback: 0 },
};
vi.mock("../lib/tarefa-regenerator.js", () => ({
  regenerateTarefasForClinic: vi.fn(async () => PER_CLINIC),
}));

import { db, clinicsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { signToken, requireSuperAdmin } from "../middleware/auth";
import { regenerateTarefasForClinic } from "../lib/tarefa-regenerator.js";
import maintenanceRouter from "./maintenance";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  // Production attaches `req.log` via pino-http; provide a no-op stand-in so the
  // handler's success logging doesn't throw under the bare test app.
  app.use((req, _res, next) => {
    (req as unknown as { log: { info: () => void; warn: () => void; error: () => void } }).log = {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
    next();
  });
  app.use("/api", requireSuperAdmin, maintenanceRouter);
  return app;
}
const app = buildApp();

const suffix = randomUUID().slice(0, 8);
let clinicId: string;

function adminToken(): string {
  return signToken({ role: "super_admin", sub: "tester" });
}
function teamToken(): string {
  const email = `gestor-${suffix}@example.com`;
  return signToken({ role: "team_member", sub: email, email, nome: "Tester", v: 2 });
}

beforeAll(async () => {
  const [c] = await db
    .insert(clinicsTable)
    .values({ nome: `Regen-all ${suffix}`, cnpj: `rall-${suffix}` })
    .returning();
  clinicId = c.id;
});

afterAll(async () => {
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicId));
});

describe("POST /admin/actions/regenerate-tarefas — auth", () => {
  it("rejects an unauthenticated caller (401)", async () => {
    vi.mocked(regenerateTarefasForClinic).mockClear();
    const res = await request(app).post("/api/admin/actions/regenerate-tarefas").send({});
    expect(res.status).toBe(401);
    expect(regenerateTarefasForClinic).not.toHaveBeenCalled();
  });

  it("denies a team_member (403)", async () => {
    vi.mocked(regenerateTarefasForClinic).mockClear();
    const res = await request(app)
      .post("/api/admin/actions/regenerate-tarefas")
      .set("Authorization", `Bearer ${teamToken()}`)
      .send({});
    expect(res.status).toBe(403);
    expect(regenerateTarefasForClinic).not.toHaveBeenCalled();
  });
});

describe("POST /admin/actions/regenerate-tarefas — super_admin", () => {
  it("processes every clinic and aggregates the per-clinic results", async () => {
    vi.mocked(regenerateTarefasForClinic).mockClear();

    const [{ value: clinicCount }] = await db.select({ value: count() }).from(clinicsTable);
    expect(clinicCount).toBeGreaterThanOrEqual(1);

    const res = await request(app)
      .post("/api/admin/actions/regenerate-tarefas")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.clinicsProcessed).toBe(clinicCount);
    expect(res.body.actionsProcessed).toBe(clinicCount * PER_CLINIC.actionsProcessed);
    expect(res.body.tarefasCreated).toBe(clinicCount * PER_CLINIC.tarefasCreated);
    expect(res.body.bySource).toEqual({
      modelo: clinicCount * PER_CLINIC.bySource.modelo,
      ia: clinicCount * PER_CLINIC.bySource.ia,
      fallback: clinicCount * PER_CLINIC.bySource.fallback,
    });

    // One call per clinic, and our seeded clinic was among them.
    expect(regenerateTarefasForClinic).toHaveBeenCalledTimes(clinicCount);
    const calledIds = vi.mocked(regenerateTarefasForClinic).mock.calls.map((c) => c[0]);
    expect(calledIds).toContain(clinicId);
  });
});
