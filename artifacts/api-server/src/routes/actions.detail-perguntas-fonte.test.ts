import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Fixed signing secret so we mint real session tokens through the production
// signing/verifying code path instead of bypassing auth.
const TEST_SIGNING_SECRET = "detail-perguntas-fonte-test-secret-0001";
vi.mock("../lib/token-secret.js", () => ({
  getTokenSigningSecret: () => TEST_SIGNING_SECRET,
}));

// The detail GET never sends email/push, but the router imports these modules;
// stub them defensively to keep the test free of any side effects.
vi.mock("../lib/email.js", () => ({
  sendEmail: vi.fn(async () => true),
  buildActionUpdateEmail: vi.fn(() => "<html></html>"),
  resolveAppUrl: vi.fn(async () => "https://app.test"),
}));
vi.mock("../lib/push.js", () => ({
  sendPushToEmail: vi.fn(async () => ({ sent: 0, failed: 0 })),
}));
vi.mock("../lib/preferences.js", () => ({
  getRecipientPrefs: vi.fn(async () => ({ emailEnabled: true, whatsappEnabled: false })),
}));

import { db, clinicsTable, actionsTable, teamTable, risksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, requireAuth } from "../middleware/auth";
import actionsRouter from "./actions";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  // The detail route relies on req.user (set by requireAuth) + inline
  // assertClinicAccess — mirror that here.
  app.use("/api", requireAuth, actionsRouter);
  return app;
}
const app = buildApp();

const suffix = randomUUID().slice(0, 8);
const gestorEmail = `gestor-${suffix}@example.com`;
const outsiderEmail = `outsider-${suffix}@example.com`;

const PERGUNTAS_FONTE = [
  {
    pergunta: "A clínica possui um sistema de gestão informatizado?",
    resposta: "Não, os registros são feitos em planilhas avulsas.",
    pilarSlug: "tecnologia",
  },
  {
    pergunta: "Os dados dos pacientes têm backup automático?",
    resposta: "Parcialmente — apenas backup manual esporádico.",
    pilarSlug: "tecnologia",
  },
];

let clinicId: string;
let otherClinicId: string;
let actionComFonteId: string;
let actionSemRiscoId: string;
let actionRiscoSemFonteId: string;

function teamToken(email: string): string {
  return signToken({ role: "team_member", sub: email, email, nome: "Tester", v: 2 });
}
function adminToken(): string {
  return signToken({ role: "super_admin", sub: "tester" });
}

beforeAll(async () => {
  const [c] = await db
    .insert(clinicsTable)
    .values({ nome: `Detail Fonte ${suffix}`, cnpj: `df-${suffix}` })
    .returning();
  clinicId = c.id;
  const [other] = await db
    .insert(clinicsTable)
    .values({ nome: `Detail Fonte Other ${suffix}`, cnpj: `df-o-${suffix}` })
    .returning();
  otherClinicId = other.id;

  await db.insert(teamTable).values({
    clinicId,
    nome: "Gestor",
    email: gestorEmail,
    temAcessoPlataforma: true,
  });
  await db.insert(teamTable).values({
    clinicId: otherClinicId,
    nome: "Outsider",
    email: outsiderEmail,
    temAcessoPlataforma: true,
  });

  // Risk WITH source answers → its action must surface perguntasFonte.
  const [riskComFonte] = await db
    .insert(risksTable)
    .values({
      clinicId,
      nome: `Sistema de gestão ausente ${suffix}`,
      probabilidade: 4,
      impacto: 4,
      severidade: 16,
      nivel: "alto",
      pilarSlug: "tecnologia",
      perguntasFonte: PERGUNTAS_FONTE,
    })
    .returning();

  // Risk WITHOUT source answers → perguntasFonte must come back null.
  const [riskSemFonte] = await db
    .insert(risksTable)
    .values({
      clinicId,
      nome: `Risco sem fonte ${suffix}`,
      probabilidade: 2,
      impacto: 2,
      severidade: 4,
      nivel: "baixo",
      pilarSlug: "financeiro",
    })
    .returning();

  const [acaoComFonte] = await db
    .insert(actionsTable)
    .values({
      clinicId,
      titulo: `Configurar sistema de gestão ${suffix}`,
      pilarSlug: "tecnologia",
      coluna: "backlog",
      riscoOrigemId: riskComFonte.id,
    })
    .returning();
  actionComFonteId = acaoComFonte.id;

  const [acaoSemRisco] = await db
    .insert(actionsTable)
    .values({ clinicId, titulo: `Ação manual ${suffix}`, coluna: "backlog" })
    .returning();
  actionSemRiscoId = acaoSemRisco.id;

  const [acaoRiscoSemFonte] = await db
    .insert(actionsTable)
    .values({
      clinicId,
      titulo: `Ação de risco sem fonte ${suffix}`,
      coluna: "backlog",
      riscoOrigemId: riskSemFonte.id,
    })
    .returning();
  actionRiscoSemFonteId = acaoRiscoSemFonte.id;
});

afterAll(async () => {
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicId));
  await db.delete(clinicsTable).where(eq(clinicsTable.id, otherClinicId));
});

describe("GET /actions/:id/detail — riscoVinculado.perguntasFonte", () => {
  it("returns the source diagnostic answers for a risk-derived action (super_admin)", async () => {
    const res = await request(app)
      .get(`/api/actions/${actionComFonteId}/detail`)
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.riscoVinculado).toBeTruthy();
    expect(res.body.riscoVinculado.perguntasFonte).toEqual(PERGUNTAS_FONTE);
  });

  it("returns the source answers to an authorized gestor (team_member)", async () => {
    const res = await request(app)
      .get(`/api/actions/${actionComFonteId}/detail`)
      .set("Authorization", `Bearer ${teamToken(gestorEmail)}`);

    expect(res.status).toBe(200);
    expect(res.body.riscoVinculado.perguntasFonte).toEqual(PERGUNTAS_FONTE);
  });

  it("returns null riscoVinculado for an action with no linked risk", async () => {
    const res = await request(app)
      .get(`/api/actions/${actionSemRiscoId}/detail`)
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.riscoVinculado).toBeNull();
  });

  it("returns perguntasFonte=null when the linked risk has no source answers", async () => {
    const res = await request(app)
      .get(`/api/actions/${actionRiscoSemFonteId}/detail`)
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.riscoVinculado).toBeTruthy();
    expect(res.body.riscoVinculado.perguntasFonte).toBeNull();
  });

  it("never surfaces a risk from another clinic (corrupted riscoOrigemId is ignored)", async () => {
    // Forge a cross-clinic link: an action on `clinicId` pointing at a risk that
    // lives on `otherClinicId`. The detail lookup is scoped to the action's own
    // clinic, so the foreign risk (and its answers) must NOT be returned.
    const [foreignRisk] = await db
      .insert(risksTable)
      .values({
        clinicId: otherClinicId,
        nome: `Risco de outra clínica ${suffix}`,
        probabilidade: 5,
        impacto: 5,
        severidade: 25,
        nivel: "critico",
        pilarSlug: "tecnologia",
        perguntasFonte: [
          {
            pergunta: "Segredo de outra clínica?",
            resposta: "Resposta confidencial de outra clínica.",
            pilarSlug: "tecnologia",
          },
        ],
      })
      .returning();
    const [crossAction] = await db
      .insert(actionsTable)
      .values({
        clinicId,
        titulo: `Ação com link corrompido ${suffix}`,
        coluna: "backlog",
        riscoOrigemId: foreignRisk.id,
      })
      .returning();

    const res = await request(app)
      .get(`/api/actions/${crossAction.id}/detail`)
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.riscoVinculado).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain("confidencial de outra clínica");
  });

  it("denies an outsider team_member (403) without leaking the answers", async () => {
    const res = await request(app)
      .get(`/api/actions/${actionComFonteId}/detail`)
      .set("Authorization", `Bearer ${teamToken(outsiderEmail)}`);

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain("sistema de gestão informatizado");
  });

  it("rejects an unauthenticated caller (401)", async () => {
    const res = await request(app).get(`/api/actions/${actionComFonteId}/detail`);
    expect(res.status).toBe(401);
  });
});
