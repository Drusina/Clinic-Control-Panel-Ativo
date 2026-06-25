import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Fixed signing secret so we mint real session tokens through the production
// signing/verifying code path instead of bypassing auth.
const TEST_SIGNING_SECRET = "risk-lifecycle-secret-0001";
vi.mock("../lib/token-secret.js", () => ({
  getTokenSigningSecret: () => TEST_SIGNING_SECRET,
}));

import { db, clinicsTable, risksTable, actionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, requireClinicAccess } from "../middleware/auth";
import risksRouter from "./risks";
import actionsRouter from "./actions";
import {
  statusFromBoard,
  severidadeToPrioridade,
  backfillRiskStatuses,
} from "../lib/risk-lifecycle";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", requireClinicAccess, actionsRouter);
  app.use("/api", requireClinicAccess, risksRouter);
  return app;
}
const app = buildApp();

const suffix = randomUUID().slice(0, 8);
let clinicId: string;

function superAdminToken(): string {
  return signToken({ role: "super_admin", sub: "tester" });
}

async function insertRisk(nome: string, status: string) {
  const [risk] = await db
    .insert(risksTable)
    .values({
      clinicId,
      nome,
      probabilidade: 4,
      impacto: 5,
      severidade: 20,
      status,
      origem: "manual",
    })
    .returning();
  return risk;
}

beforeAll(async () => {
  const [clinic] = await db
    .insert(clinicsTable)
    .values({ nome: `Risk Lifecycle ${suffix}`, cnpj: `rlc-${suffix}` })
    .returning();
  clinicId = clinic.id;
});

afterAll(async () => {
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicId));
});

describe("statusFromBoard (pure)", () => {
  it("returns null with no linked cards (risk stays manual)", () => {
    expect(statusFromBoard([])).toBeNull();
  });
  it("maps all-backlog to aceito", () => {
    expect(statusFromBoard(["backlog", "backlog"])).toBe("aceito");
  });
  it("maps all-done to mitigado", () => {
    expect(statusFromBoard(["done", "done"])).toBe("mitigado");
  });
  it("maps mixed columns to em_mitigacao", () => {
    expect(statusFromBoard(["backlog", "done"])).toBe("em_mitigacao");
    expect(statusFromBoard(["doing"])).toBe("em_mitigacao");
    expect(statusFromBoard(["review", "done"])).toBe("em_mitigacao");
  });
});

describe("severidadeToPrioridade (pure)", () => {
  it("maps severity bands", () => {
    expect(severidadeToPrioridade(20)).toBe("alta");
    expect(severidadeToPrioridade(15)).toBe("alta");
    expect(severidadeToPrioridade(14)).toBe("media");
    expect(severidadeToPrioridade(7)).toBe("media");
    expect(severidadeToPrioridade(6)).toBe("baixa");
    expect(severidadeToPrioridade(1)).toBe("baixa");
  });
});

describe("POST /api/risks/:id/accept", () => {
  it("creates a backlog card linked to the risk and derives status aceito", async () => {
    const risk = await insertRisk(`Aceitar sem card ${suffix}`, "identificado");

    const res = await request(app)
      .post(`/api/risks/${risk.id}/accept`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("aceito");
    expect(res.body.temCard).toBe(true);

    const cards = await db
      .select()
      .from(actionsTable)
      .where(eq(actionsTable.riscoOrigemId, risk.id));
    expect(cards).toHaveLength(1);
    expect(cards[0].coluna).toBe("backlog");
    expect(cards[0].prioridade).toBe("alta");
  });

  it("clears a 'nao_aceito' override and is idempotent (no duplicate card)", async () => {
    const risk = await insertRisk(`Reconsiderar ${suffix}`, "nao_aceito");
    await db
      .update(risksTable)
      .set({ statusJustificativa: "Tolerável por ora" })
      .where(eq(risksTable.id, risk.id));

    const first = await request(app)
      .post(`/api/risks/${risk.id}/accept`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(first.status).toBe(200);
    expect(first.body.status).toBe("aceito");
    expect(first.body.statusJustificativa).toBeNull();

    const second = await request(app)
      .post(`/api/risks/${risk.id}/accept`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(second.status).toBe(200);

    const cards = await db
      .select()
      .from(actionsTable)
      .where(eq(actionsTable.riscoOrigemId, risk.id));
    expect(cards).toHaveLength(1);
  });
});

describe("PATCH /api/actions/:id reconciles the linked risk status", () => {
  it("drives aceito → em_mitigacao → mitigado as the card moves", async () => {
    const risk = await insertRisk(`Ciclo board ${suffix}`, "identificado");

    // Accept to create the linked backlog card → status becomes aceito.
    const accepted = await request(app)
      .post(`/api/risks/${risk.id}/accept`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(accepted.body.status).toBe("aceito");
    const [card] = await db
      .select()
      .from(actionsTable)
      .where(eq(actionsTable.riscoOrigemId, risk.id));
    expect(card).toBeTruthy();

    // Move to "doing" → em_mitigacao.
    const toDoing = await request(app)
      .patch(`/api/actions/${card.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ coluna: "doing" });
    expect(toDoing.status).toBe(200);
    let [r] = await db.select().from(risksTable).where(eq(risksTable.id, risk.id));
    expect(r.status).toBe("em_mitigacao");

    // Move to "done" → mitigado.
    const toDone = await request(app)
      .patch(`/api/actions/${card.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ coluna: "done" });
    expect(toDone.status).toBe(200);
    [r] = await db.select().from(risksTable).where(eq(risksTable.id, risk.id));
    expect(r.status).toBe("mitigado");
  });

  it("never touches a 'nao_aceito' risk when its card moves", async () => {
    const risk = await insertRisk(`Protegido ${suffix}`, "identificado");
    await request(app)
      .post(`/api/risks/${risk.id}/accept`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    const [card] = await db
      .select()
      .from(actionsTable)
      .where(eq(actionsTable.riscoOrigemId, risk.id));

    // Force the protected override directly, then move the card.
    await db
      .update(risksTable)
      .set({ status: "nao_aceito" })
      .where(eq(risksTable.id, risk.id));

    await request(app)
      .patch(`/api/actions/${card.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ coluna: "done" });

    const [r] = await db.select().from(risksTable).where(eq(risksTable.id, risk.id));
    expect(r.status).toBe("nao_aceito");
  });
});

describe("DELETE /api/actions/:id reconciles the linked risk status", () => {
  it("returns the risk to identificado when its last card is deleted", async () => {
    const risk = await insertRisk(`Excluir último card ${suffix}`, "identificado");

    // Accept to create the linked backlog card → status becomes aceito.
    const accepted = await request(app)
      .post(`/api/risks/${risk.id}/accept`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(accepted.body.status).toBe("aceito");
    const [card] = await db
      .select()
      .from(actionsTable)
      .where(eq(actionsTable.riscoOrigemId, risk.id));
    expect(card).toBeTruthy();

    // Delete the only card → the board no longer supports "aceito".
    const del = await request(app)
      .delete(`/api/actions/${card.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(del.status).toBe(204);

    const [r] = await db.select().from(risksTable).where(eq(risksTable.id, risk.id));
    expect(r.status).toBe("identificado");
  });

  it("never touches a 'nao_aceito' risk when its card is deleted", async () => {
    const risk = await insertRisk(`Protegido excluir ${suffix}`, "identificado");
    await request(app)
      .post(`/api/risks/${risk.id}/accept`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    const [card] = await db
      .select()
      .from(actionsTable)
      .where(eq(actionsTable.riscoOrigemId, risk.id));

    // Force the protected override directly, then delete the card.
    await db
      .update(risksTable)
      .set({ status: "nao_aceito" })
      .where(eq(risksTable.id, risk.id));

    const del = await request(app)
      .delete(`/api/actions/${card.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(del.status).toBe(204);

    const [r] = await db.select().from(risksTable).where(eq(risksTable.id, risk.id));
    expect(r.status).toBe("nao_aceito");
  });
});

describe("PATCH /api/risks/:id keeps the board as the source of truth", () => {
  it("re-derives status from the board, overriding a contradictory manual status", async () => {
    const risk = await insertRisk(`Board manda ${suffix}`, "identificado");
    await request(app)
      .post(`/api/risks/${risk.id}/accept`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    const [card] = await db
      .select()
      .from(actionsTable)
      .where(eq(actionsTable.riscoOrigemId, risk.id));

    // Card still in backlog → board says aceito. A direct PATCH to mitigado
    // must be overridden back to aceito.
    const toMitigado = await request(app)
      .patch(`/api/risks/${risk.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "mitigado" });
    expect(toMitigado.status).toBe(200);
    expect(toMitigado.body.status).toBe("aceito");

    // Move the card to done → board says mitigado. A direct PATCH back to
    // identificado must be overridden to mitigado.
    await request(app)
      .patch(`/api/actions/${card.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ coluna: "done" });
    const toIdentificado = await request(app)
      .patch(`/api/risks/${risk.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "identificado" });
    expect(toIdentificado.status).toBe(200);
    expect(toIdentificado.body.status).toBe("mitigado");
  });

  it("preserves a manual status on a risk with no linked card", async () => {
    const risk = await insertRisk(`Manual sem card ${suffix}`, "identificado");
    const res = await request(app)
      .patch(`/api/risks/${risk.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "em_mitigacao" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("em_mitigacao");
  });

  it("still lets Descartar set nao_aceito and is not overridden by the board", async () => {
    const risk = await insertRisk(`Descartar ${suffix}`, "identificado");
    await request(app)
      .post(`/api/risks/${risk.id}/accept`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    const res = await request(app)
      .patch(`/api/risks/${risk.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "nao_aceito", statusJustificativa: "Risco tolerável" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("nao_aceito");

    // The backlog card is removed so the risk no longer occupies the board.
    const cards = await db
      .select()
      .from(actionsTable)
      .where(eq(actionsTable.riscoOrigemId, risk.id));
    expect(cards).toHaveLength(0);
  });
});

describe("backfillRiskStatuses", () => {
  it("heals a board-linked risk stuck on a stale status and is idempotent", async () => {
    const risk = await insertRisk(`Backfill legado ${suffix}`, "identificado");

    // Give it a linked backlog card, then force a stale status that contradicts
    // the board (legacy data where the lifecycle never derived "aceito").
    await db.insert(actionsTable).values({
      clinicId,
      titulo: risk.nome,
      coluna: "backlog",
      ordem: 1,
      riscoOrigemId: risk.id,
    });
    await db
      .update(risksTable)
      .set({ status: "identificado" })
      .where(eq(risksTable.id, risk.id));

    const changed = await backfillRiskStatuses();
    expect(changed).toBeGreaterThanOrEqual(1);

    const [healed] = await db.select().from(risksTable).where(eq(risksTable.id, risk.id));
    expect(healed.status).toBe("aceito");

    // Idempotent: a second pass must not re-touch the now-consistent row.
    const [before] = await db.select().from(risksTable).where(eq(risksTable.id, risk.id));
    await backfillRiskStatuses();
    const [after] = await db.select().from(risksTable).where(eq(risksTable.id, risk.id));
    expect(after.status).toBe(before.status);
  });

  it("never touches a nao_aceito risk even with a linked card", async () => {
    const risk = await insertRisk(`Backfill protegido ${suffix}`, "nao_aceito");
    await db.insert(actionsTable).values({
      clinicId,
      titulo: risk.nome,
      coluna: "doing",
      ordem: 2,
      riscoOrigemId: risk.id,
    });

    await backfillRiskStatuses();

    const [r] = await db.select().from(risksTable).where(eq(risksTable.id, risk.id));
    expect(r.status).toBe("nao_aceito");
  });
});
