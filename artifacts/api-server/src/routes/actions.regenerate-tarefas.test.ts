import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Fixed signing secret so we mint real session tokens through the production
// signing/verifying code path instead of bypassing auth.
const TEST_SIGNING_SECRET = "regenerate-tarefas-test-secret-0001";
vi.mock("../lib/token-secret.js", () => ({
  getTokenSigningSecret: () => TEST_SIGNING_SECRET,
}));

// Deterministic suggester so source-by-origin is unambiguous: any AI/manual
// action gets these two titles with source "ai" (→ "ia"). Curated/plano-padrão
// actions must NOT reach the suggester at all (covered by call assertions).
vi.mock("../lib/tarefa-suggester.js", () => ({
  suggestTarefasForAction: vi.fn(async () => ({
    tarefas: ["IA-T1", "IA-T2"],
    source: "ai" as const,
  })),
}));

// Notifications are unrelated to this route; stub to avoid any side effects.
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

import {
  db,
  clinicsTable,
  actionsTable,
  acaoTarefasTable,
  teamTable,
  risksTable,
} from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { signToken, requireClinicAccess } from "../middleware/auth";
import { suggestTarefasForAction } from "../lib/tarefa-suggester.js";
import actionsRouter from "./actions";

const CURATED_MODELO = {
  titulo: "Mapear processos operacionais da clínica",
  pilarSlug: "operacoes",
  tarefas: [
    "Listar os processos de cada setor",
    "Entrevistar os responsáveis de cada área",
    "Desenhar o fluxograma de cada processo",
    "Validar o mapeamento com a equipe",
  ],
};

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
let riskId: string;
let actionModeloId: string;
let actionRiscoId: string;
let actionManualId: string;
let actionBId: string;
let actionBTarefaId: string;

function teamToken(email: string): string {
  return signToken({ role: "team_member", sub: email, email, nome: "Tester", v: 2 });
}
function adminToken(): string {
  return signToken({ role: "super_admin", sub: "tester" });
}

async function topLevelTarefas(acaoId: string) {
  return db
    .select()
    .from(acaoTarefasTable)
    .where(and(eq(acaoTarefasTable.acaoId, acaoId), isNull(acaoTarefasTable.parentTarefaId)))
    .orderBy(acaoTarefasTable.ordem);
}
async function allTarefas(acaoId: string) {
  return db.select().from(acaoTarefasTable).where(eq(acaoTarefasTable.acaoId, acaoId));
}

beforeAll(async () => {
  // Unique plano so getTemplateForPlan() misses any DB-stored template row and
  // deterministically falls back to the built-in ICS_ACTIONS curated library.
  const [a] = await db
    .insert(clinicsTable)
    .values({ nome: `Regen A ${suffix}`, cnpj: `ra-${suffix}`, plano: `regen-${suffix}` })
    .returning();
  clinicAId = a.id;
  const [b] = await db
    .insert(clinicsTable)
    .values({ nome: `Regen B ${suffix}`, cnpj: `rb-${suffix}` })
    .returning();
  clinicBId = b.id;

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

  const [risk] = await db
    .insert(risksTable)
    .values({
      clinicId: clinicAId,
      nome: `Inadimplência alta ${suffix}`,
      probabilidade: 4,
      impacto: 5,
      severidade: 20,
      nivel: "alto",
      pilarSlug: "financeiro",
    })
    .returning();
  riskId = risk.id;

  // Plano-padrão action (matches the curated template) — preloaded with stale
  // tarefas (incl. a responsável + a subtarefa) so we can prove REPLACE wipes them.
  const [modelo] = await db
    .insert(actionsTable)
    .values({
      clinicId: clinicAId,
      titulo: CURATED_MODELO.titulo,
      pilarSlug: CURATED_MODELO.pilarSlug,
      coluna: "backlog",
      prioridade: "alta",
    })
    .returning();
  actionModeloId = modelo.id;
  const [staleTop] = await db
    .insert(acaoTarefasTable)
    .values({ acaoId: actionModeloId, titulo: "Tarefa antiga", responsavelNome: "Velho", responsavelEmail: gestorEmail, ordem: 0 })
    .returning();
  await db
    .insert(acaoTarefasTable)
    .values({ acaoId: actionModeloId, parentTarefaId: staleTop.id, titulo: "Subtarefa antiga", ordem: 0 });

  // Risk-origin action — card fields populated to prove they are preserved.
  const [risco] = await db
    .insert(actionsTable)
    .values({
      clinicId: clinicAId,
      titulo: `Mitigar inadimplência ${suffix}`,
      pilarSlug: "financeiro",
      coluna: "fazendo",
      prioridade: "alta",
      responsavelNome: "Fulano",
      prazo: "2026-12-31",
      riscoOrigemId: riskId,
    })
    .returning();
  actionRiscoId = risco.id;

  // Manual action (no curated match, no risk).
  const [manual] = await db
    .insert(actionsTable)
    .values({ clinicId: clinicAId, titulo: `Ação manual ${suffix}`, coluna: "backlog" })
    .returning();
  actionManualId = manual.id;

  // Clinic B action with a tarefa — used to prove regeneration is clinic-scoped.
  const [actionB] = await db
    .insert(actionsTable)
    .values({ clinicId: clinicBId, titulo: `Ação B ${suffix}`, coluna: "backlog" })
    .returning();
  actionBId = actionB.id;
  const [bt] = await db
    .insert(acaoTarefasTable)
    .values({ acaoId: actionBId, titulo: "Tarefa da clínica B", ordem: 0 })
    .returning();
  actionBTarefaId = bt.id;
});

afterAll(async () => {
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicAId));
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicBId));
});

describe("POST /clinics/:clinicId/actions/regenerate-tarefas — auth", () => {
  it("denies a gestor (team_member) with clinic access (403)", async () => {
    const res = await request(app)
      .post(`/api/clinics/${clinicAId}/actions/regenerate-tarefas`)
      .set("Authorization", `Bearer ${teamToken(gestorEmail)}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("denies an outsider team_member (403)", async () => {
    const res = await request(app)
      .post(`/api/clinics/${clinicAId}/actions/regenerate-tarefas`)
      .set("Authorization", `Bearer ${teamToken(outsiderEmail)}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated caller (401)", async () => {
    const res = await request(app)
      .post(`/api/clinics/${clinicAId}/actions/regenerate-tarefas`)
      .send({});
    expect(res.status).toBe(401);
  });
});

describe("POST /clinics/:clinicId/actions/regenerate-tarefas — super_admin", () => {
  it("replaces tarefas, picks source by origin, preserves cards, scopes to clinic", async () => {
    vi.mocked(suggestTarefasForAction).mockClear();

    const res = await request(app)
      .post(`/api/clinics/${clinicAId}/actions/regenerate-tarefas`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.actionsProcessed).toBe(3);
    // 4 curated (modelo) + 2 + 2 (ia) = 8.
    expect(res.body.tarefasCreated).toBe(8);
    expect(res.body.bySource).toEqual({ modelo: 1, ia: 2, fallback: 0 });

    // Plano-padrão action → curated library titles (stale tarefas + subtarefa gone).
    const modeloRows = await topLevelTarefas(actionModeloId);
    expect(modeloRows.map((r) => r.titulo)).toEqual(CURATED_MODELO.tarefas);
    const modeloAll = await allTarefas(actionModeloId);
    expect(modeloAll).toHaveLength(4); // no leftover subtarefa
    // Titles only — never responsável/data/status.
    expect(modeloRows.every((r) => r.status === "a_fazer")).toBe(true);
    expect(modeloRows.every((r) => r.responsavelEmail === null)).toBe(true);
    expect(modeloRows.every((r) => r.prazo === null)).toBe(true);

    // Risk + manual actions → AI titles.
    expect((await topLevelTarefas(actionRiscoId)).map((r) => r.titulo)).toEqual(["IA-T1", "IA-T2"]);
    expect((await topLevelTarefas(actionManualId)).map((r) => r.titulo)).toEqual(["IA-T1", "IA-T2"]);

    // The suggester ran for the two non-curated actions, never for the curated one.
    const calledTitulos = vi.mocked(suggestTarefasForAction).mock.calls.map((c) => c[0].titulo);
    expect(calledTitulos).toHaveLength(2);
    expect(calledTitulos).toContain(`Mitigar inadimplência ${suffix}`);
    expect(calledTitulos).toContain(`Ação manual ${suffix}`);
    expect(calledTitulos).not.toContain(CURATED_MODELO.titulo);

    // Card fields preserved (only tarefas change).
    const [risco] = await db.select().from(actionsTable).where(eq(actionsTable.id, actionRiscoId));
    expect(risco.riscoOrigemId).toBe(riskId);
    expect(risco.responsavelNome).toBe("Fulano");
    expect(risco.prazo).toBe("2026-12-31");
    expect(risco.prioridade).toBe("alta");
    expect(risco.coluna).toBe("fazendo");

    // Clinic B untouched (scoping).
    const bRows = await allTarefas(actionBId);
    expect(bRows).toHaveLength(1);
    expect(bRows[0].id).toBe(actionBTarefaId);
  });

  it("is idempotent / safe to re-run (no duplication or growth)", async () => {
    const res = await request(app)
      .post(`/api/clinics/${clinicAId}/actions/regenerate-tarefas`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.tarefasCreated).toBe(8);
    expect(res.body.bySource).toEqual({ modelo: 1, ia: 2, fallback: 0 });

    expect((await topLevelTarefas(actionModeloId)).map((r) => r.titulo)).toEqual(CURATED_MODELO.tarefas);
    expect(await allTarefas(actionModeloId)).toHaveLength(4);
    expect(await topLevelTarefas(actionRiscoId)).toHaveLength(2);
    expect(await topLevelTarefas(actionManualId)).toHaveLength(2);
  });
});
