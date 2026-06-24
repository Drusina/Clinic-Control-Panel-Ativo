import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Fixed signing secret so we mint real session tokens through the production
// signing/verifying code path instead of bypassing auth.
const TEST_SIGNING_SECRET = "risks-nao-aceito-secret-0001";
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
import { eq, and } from "drizzle-orm";
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
    .values({ nome: `Nao Aceito Cleanup ${suffix}`, cnpj: `nac-${suffix}` })
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

/**
 * Commits one diagnostic-derived risk with `criarCard: true`, producing a
 * backlog action + tarefas. Re-commit replaces prior diagnostic-derived risks,
 * so exactly one derived risk (and its card) exists afterwards.
 */
async function commitRiskWithCard(nome: string) {
  const res = await request(app)
    .post(`/api/clinics/${clinicId}/diagnostics/${diagnosticId}/generate-risks/commit`)
    .set("Authorization", `Bearer ${superAdminToken()}`)
    .send({
      risks: [
        {
          nome,
          probabilidade: 4,
          impacto: 5,
          pilarSlug: "financeiro",
          criarCard: true,
          tarefasSugeridas: ["Primeira tarefa", "Segunda tarefa"],
        },
      ],
    });
  expect(res.status).toBe(201);

  const [risk] = await db
    .select()
    .from(risksTable)
    .where(and(eq(risksTable.clinicId, clinicId), eq(risksTable.diagnosticoId, diagnosticId)));
  const [action] = await db
    .select()
    .from(actionsTable)
    .where(eq(actionsTable.riscoOrigemId, risk.id));
  return { risk, action };
}

describe("PATCH /api/risks/:id — 'Não aceito' limpa o card no backlog", () => {
  it("removes the backlog action + tarefas when the risk is marked 'Não aceito'", async () => {
    const { risk, action } = await commitRiskWithCard(`Risco backlog ${suffix}`);
    expect(action).toBeTruthy();
    expect(action.coluna).toBe("backlog");

    const tarefasBefore = await db
      .select()
      .from(acaoTarefasTable)
      .where(eq(acaoTarefasTable.acaoId, action.id));
    expect(tarefasBefore.length).toBeGreaterThan(0);

    const res = await request(app)
      .patch(`/api/risks/${risk.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "nao_aceito", statusJustificativa: "Risco tolerável por ora" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("nao_aceito");

    // The card and its tarefas (cascade) are gone from the Plano de Ação.
    const actionsAfter = await db
      .select()
      .from(actionsTable)
      .where(eq(actionsTable.id, action.id));
    expect(actionsAfter).toHaveLength(0);
    const tarefasAfter = await db
      .select()
      .from(acaoTarefasTable)
      .where(eq(acaoTarefasTable.acaoId, action.id));
    expect(tarefasAfter).toHaveLength(0);

    // The risk itself remains visible in the Mapa de Riscos.
    const [riskAfter] = await db.select().from(risksTable).where(eq(risksTable.id, risk.id));
    expect(riskAfter).toBeTruthy();
    expect(riskAfter.status).toBe("nao_aceito");
  });

  it("preserves a card already moved out of backlog", async () => {
    const { risk, action } = await commitRiskWithCard(`Risco em andamento ${suffix}`);
    expect(action).toBeTruthy();

    // Simula trabalho já iniciado: o card saiu do backlog.
    await db
      .update(actionsTable)
      .set({ coluna: "doing" })
      .where(eq(actionsTable.id, action.id));

    const res = await request(app)
      .patch(`/api/risks/${risk.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "nao_aceito", statusJustificativa: "Tolerável" });
    expect(res.status).toBe(200);

    const [actionAfter] = await db
      .select()
      .from(actionsTable)
      .where(eq(actionsTable.id, action.id));
    expect(actionAfter).toBeTruthy();
    expect(actionAfter.coluna).toBe("doing");

    const tarefasAfter = await db
      .select()
      .from(acaoTarefasTable)
      .where(eq(acaoTarefasTable.acaoId, action.id));
    expect(tarefasAfter.length).toBeGreaterThan(0);
  });

  it("deletes nothing for status changes other than 'Não aceito'", async () => {
    const { risk, action } = await commitRiskWithCard(`Risco mitigado ${suffix}`);
    expect(action).toBeTruthy();
    expect(action.coluna).toBe("backlog");

    const res = await request(app)
      .patch(`/api/risks/${risk.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "mitigado" });
    expect(res.status).toBe(200);

    const [actionAfter] = await db
      .select()
      .from(actionsTable)
      .where(eq(actionsTable.id, action.id));
    expect(actionAfter).toBeTruthy();
    expect(actionAfter.coluna).toBe("backlog");
  });
});
