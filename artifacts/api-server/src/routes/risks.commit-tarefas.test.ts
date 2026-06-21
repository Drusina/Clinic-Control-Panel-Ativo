import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Fixed signing secret so we mint real session tokens through the production
// signing/verifying code path instead of bypassing auth.
const TEST_SIGNING_SECRET = "risks-commit-tarefas-secret-0001";
vi.mock("../lib/token-secret.js", () => ({
  getTokenSigningSecret: () => TEST_SIGNING_SECRET,
}));

import {
  db,
  clinicsTable,
  diagnosticsTable,
  risksTable,
  actionsTable,
  acaoTarefasTable,
} from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { signToken, requireClinicAccess } from "../middleware/auth";
import risksRouter from "./risks";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", requireClinicAccess, risksRouter);
  return app;
}
const app = buildApp();

const suffix = randomUUID().slice(0, 8);
let clinicId: string;
let diagnosticId: string;

function superAdminToken(): string {
  return signToken({ role: "super_admin", sub: "tester" });
}

beforeAll(async () => {
  const [clinic] = await db
    .insert(clinicsTable)
    .values({ nome: `Commit Tarefas ${suffix}`, cnpj: `ct-${suffix}` })
    .returning();
  clinicId = clinic.id;

  const [diag] = await db
    .insert(diagnosticsTable)
    .values({ clinicId, status: "concluido", concluidoEm: new Date() })
    .returning();
  diagnosticId = diag.id;
});

afterAll(async () => {
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicId));
});

describe("POST generate-risks/commit — risco + ação + tarefas em 1 tx", () => {
  it("creates the risk, its action card, and the suggested tarefas atomically", async () => {
    const res = await request(app)
      .post(`/api/clinics/${clinicId}/diagnostics/${diagnosticId}/generate-risks/commit`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({
        risks: [
          {
            nome: `Risco com tarefas ${suffix}`,
            descricao: "Descrição do risco",
            probabilidade: 4,
            impacto: 5,
            pilarSlug: "financeiro",
            acoesMitigadoras: "Mitigar já",
            criarCard: true,
            tarefasSugeridas: ["  Primeira tarefa ", "Primeira tarefa", "Segunda tarefa"],
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);
    expect(res.body.cardsCreated).toBe(1);

    // The action card was derived from the risk.
    const [risk] = await db
      .select()
      .from(risksTable)
      .where(and(eq(risksTable.clinicId, clinicId), eq(risksTable.diagnosticoId, diagnosticId)));
    expect(risk).toBeTruthy();

    const [action] = await db
      .select()
      .from(actionsTable)
      .where(eq(actionsTable.riscoOrigemId, risk.id));
    expect(action).toBeTruthy();

    // Tarefas are sanitized + deduped, titles only.
    const tarefas = await db
      .select()
      .from(acaoTarefasTable)
      .where(
        and(eq(acaoTarefasTable.acaoId, action.id), isNull(acaoTarefasTable.parentTarefaId)),
      );
    expect(tarefas.map((t) => t.titulo).sort()).toEqual(["Primeira tarefa", "Segunda tarefa"]);
    expect(tarefas.every((t) => t.status === "a_fazer")).toBe(true);
    expect(tarefas.every((t) => t.responsavelEmail === null)).toBe(true);
  });

  it("creates the risk WITHOUT tarefas when none are suggested (IA fallback → [])", async () => {
    const res = await request(app)
      .post(`/api/clinics/${clinicId}/diagnostics/${diagnosticId}/generate-risks/commit`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({
        risks: [
          {
            nome: `Risco sem tarefas ${suffix}`,
            probabilidade: 2,
            impacto: 2,
            criarCard: true,
            tarefasSugeridas: [],
          },
        ],
      });

    expect(res.status).toBe(201);
    // Re-commit replaces the diagnostic-derived risks, so exactly one remains.
    const [risk] = await db
      .select()
      .from(risksTable)
      .where(and(eq(risksTable.clinicId, clinicId), eq(risksTable.diagnosticoId, diagnosticId)));
    const [action] = await db
      .select()
      .from(actionsTable)
      .where(eq(actionsTable.riscoOrigemId, risk.id));
    expect(action).toBeTruthy();
    const tarefas = await db
      .select()
      .from(acaoTarefasTable)
      .where(eq(acaoTarefasTable.acaoId, action.id));
    expect(tarefas).toHaveLength(0);
  });
});
