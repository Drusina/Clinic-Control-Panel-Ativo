import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Fixed signing secret so we mint real session tokens through the production
// signing/verifying code path instead of bypassing auth.
const TEST_SIGNING_SECRET = "suggest-tarefas-test-secret-0001";
vi.mock("../lib/token-secret.js", () => ({
  getTokenSigningSecret: () => TEST_SIGNING_SECRET,
}));

// Deterministic suggester so the route test never depends on a live AI key —
// the real fallback behaviour is covered in lib/tarefa-suggester.test.ts.
vi.mock("../lib/tarefa-suggester.js", () => ({
  suggestTarefasForAction: vi.fn(async () => ({
    tarefas: ["Mapear contexto", "Executar etapas"],
    source: "fallback" as const,
  })),
}));

// Notifications are unrelated to these routes; stub to avoid any side effects.
vi.mock("../lib/email.js", () => ({
  sendEmail: vi.fn(async () => true),
  buildActionUpdateEmail: vi.fn(() => "<html></html>"),
  buildTarefaAssignedEmail: vi.fn(() => "<html></html>"),
  resolveAppUrl: vi.fn(async () => "https://app.test"),
}));
vi.mock("../lib/push.js", () => ({
  sendPushToEmail: vi.fn(async () => ({ sent: 0, failed: 0 })),
}));
vi.mock("../lib/preferences.js", () => ({
  getRecipientPrefs: vi.fn(async () => ({ emailEnabled: true, whatsappEnabled: false })),
}));

import { db, clinicsTable, actionsTable, acaoTarefasTable, teamTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { signToken, requireClinicAccess } from "../middleware/auth";
import actionsRouter from "./actions";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", requireClinicAccess, actionsRouter);
  return app;
}
const app = buildApp();

const suffix = randomUUID().slice(0, 8);
const gestorEmail = `gestor-${suffix}@example.com`;
const outsiderEmail = `outsider-${suffix}@example.com`;
let clinicAId: string;
let clinicBId: string;

function token(email: string): string {
  return signToken({ role: "team_member", sub: email, email, nome: "Tester", v: 2 });
}

async function topLevelTarefas(acaoId: string) {
  return db
    .select()
    .from(acaoTarefasTable)
    .where(and(eq(acaoTarefasTable.acaoId, acaoId), isNull(acaoTarefasTable.parentTarefaId)));
}

beforeAll(async () => {
  const [a] = await db
    .insert(clinicsTable)
    .values({ nome: `Sug A ${suffix}`, cnpj: `sa-${suffix}` })
    .returning();
  clinicAId = a.id;
  const [b] = await db
    .insert(clinicsTable)
    .values({ nome: `Sug B ${suffix}`, cnpj: `sb-${suffix}` })
    .returning();
  clinicBId = b.id;

  // gestor → clinic A; outsider → clinic B only.
  await db.insert(teamTable).values({
    clinicId: clinicAId,
    nome: "Gestor A",
    email: gestorEmail,
    temAcessoPlataforma: true,
  });
  await db.insert(teamTable).values({
    clinicId: clinicBId,
    nome: "Outsider B",
    email: outsiderEmail,
    temAcessoPlataforma: true,
  });
});

afterAll(async () => {
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicAId));
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicBId));
});

describe("POST /clinics/:clinicId/actions/suggest-tarefas", () => {
  it("returns suggested titles + source for an authorized gestor", async () => {
    const res = await request(app)
      .post(`/api/clinics/${clinicAId}/actions/suggest-tarefas`)
      .set("Authorization", `Bearer ${token(gestorEmail)}`)
      .send({ titulo: "Revisar contratos" });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe("fallback");
    expect(Array.isArray(res.body.tarefas)).toBe(true);
    expect(res.body.tarefas.length).toBeGreaterThan(0);
  });

  it("denies a gestor without access to the clinic (403)", async () => {
    const res = await request(app)
      .post(`/api/clinics/${clinicAId}/actions/suggest-tarefas`)
      .set("Authorization", `Bearer ${token(outsiderEmail)}`)
      .send({ titulo: "Revisar contratos" });

    expect(res.status).toBe(403);
  });
});

describe("POST /clinics/:clinicId/actions with tarefasSugeridas", () => {
  it("creates the action and its suggested tarefas atomically (sanitized + deduped)", async () => {
    const res = await request(app)
      .post(`/api/clinics/${clinicAId}/actions`)
      .set("Authorization", `Bearer ${token(gestorEmail)}`)
      .send({
        titulo: "Ação com tarefas",
        tarefasSugeridas: ["  Tarefa 1 ", "Tarefa 1", "Tarefa 2"],
      });

    expect(res.status).toBe(201);
    // Case-insensitive dedup collapses the repeated "Tarefa 1".
    expect(res.body.tarefasTotal).toBe(2);
    expect(res.body.tarefasConcluidas).toBe(0);

    const rows = await topLevelTarefas(res.body.id);
    expect(rows.map((r) => r.titulo).sort()).toEqual(["Tarefa 1", "Tarefa 2"]);
    // Suggested tarefas carry titles only — never responsável/data/status.
    expect(rows.every((r) => r.status === "a_fazer")).toBe(true);
    expect(rows.every((r) => r.responsavelEmail === null)).toBe(true);
    expect(rows.every((r) => r.prazo === null)).toBe(true);
  });

  it("creates an action with NO tarefas when none are suggested", async () => {
    const res = await request(app)
      .post(`/api/clinics/${clinicAId}/actions`)
      .set("Authorization", `Bearer ${token(gestorEmail)}`)
      .send({ titulo: "Ação sem tarefas" });

    expect(res.status).toBe(201);
    expect(res.body.tarefasTotal).toBe(0);
    const rows = await topLevelTarefas(res.body.id);
    expect(rows).toHaveLength(0);
  });

  it("denies creating an action in a clinic the gestor cannot access (403)", async () => {
    const res = await request(app)
      .post(`/api/clinics/${clinicAId}/actions`)
      .set("Authorization", `Bearer ${token(outsiderEmail)}`)
      .send({ titulo: "Intrusa", tarefasSugeridas: ["x"] });

    expect(res.status).toBe(403);
  });
});

describe("POST /actions/:id/tarefas/batch", () => {
  it("appends a batch of suggested tarefas to an existing action", async () => {
    const [action] = await db
      .insert(actionsTable)
      .values({ clinicId: clinicAId, titulo: `Batch ${suffix}` })
      .returning();

    const res = await request(app)
      .post(`/api/actions/${action.id}/tarefas/batch`)
      .set("Authorization", `Bearer ${token(gestorEmail)}`)
      .send({ titulos: ["B1", "B2"] });

    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);

    const rows = await topLevelTarefas(action.id);
    expect(rows.map((r) => r.titulo).sort()).toEqual(["B1", "B2"]);
  });

  it("denies batch on an action in another clinic (403)", async () => {
    const [action] = await db
      .insert(actionsTable)
      .values({ clinicId: clinicAId, titulo: `Batch2 ${suffix}` })
      .returning();

    const res = await request(app)
      .post(`/api/actions/${action.id}/tarefas/batch`)
      .set("Authorization", `Bearer ${token(outsiderEmail)}`)
      .send({ titulos: ["X"] });

    expect(res.status).toBe(403);
  });
});
