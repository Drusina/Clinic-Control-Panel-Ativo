import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Fixed signing secret so we mint real session tokens through the production
// signing/verifying code path instead of bypassing auth.
const TEST_SIGNING_SECRET = "tarefas-test-signing-secret-0001";
vi.mock("../lib/token-secret.js", () => ({
  getTokenSigningSecret: () => TEST_SIGNING_SECRET,
}));

const { sendEmailMock, sendPushToEmailMock, getRecipientPrefsMock } = vi.hoisted(
  () => ({
    sendEmailMock: vi.fn(async () => true),
    sendPushToEmailMock: vi.fn(async () => ({ sent: 1, failed: 0 })),
    getRecipientPrefsMock: vi.fn(async () => ({
      emailEnabled: true,
      whatsappEnabled: false,
    })),
  }),
);

vi.mock("../lib/email.js", () => ({
  sendEmail: sendEmailMock,
  buildActionUpdateEmail: vi.fn(() => "<html>action</html>"),
  buildTarefaAssignedEmail: vi.fn(() => "<html>tarefa</html>"),
  resolveAppUrl: vi.fn(async () => "https://app.test"),
}));
vi.mock("../lib/push.js", () => ({
  sendPushToEmail: sendPushToEmailMock,
}));
vi.mock("../lib/preferences.js", () => ({
  getRecipientPrefs: getRecipientPrefsMock,
}));

import {
  db,
  clinicsTable,
  actionsTable,
  acaoTarefasTable,
  teamTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, requireClinicAccess } from "../middleware/auth";
import actionsRouter from "./actions";

// Mirror the production mount: `router.use(requireClinicAccess, actionsRouter)`.
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
let acaoAId: string;

function teamMemberToken(email: string): string {
  return signToken({ role: "team_member", sub: email, email, nome: "Tester", v: 2 });
}

async function waitFor(fn: () => void, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      fn();
      return;
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await new Promise((r) => setTimeout(r, 25));
    }
  }
}

beforeAll(async () => {
  const [a] = await db
    .insert(clinicsTable)
    .values({ nome: `Tarefas A ${suffix}`, cnpj: `tA-${suffix}` })
    .returning();
  clinicAId = a.id;
  const [b] = await db
    .insert(clinicsTable)
    .values({ nome: `Tarefas B ${suffix}`, cnpj: `tB-${suffix}` })
    .returning();
  clinicBId = b.id;

  // gestor has platform access to clinic A; outsider only to clinic B.
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

  const [action] = await db
    .insert(actionsTable)
    .values({ clinicId: clinicAId, titulo: `Ação A ${suffix}` })
    .returning();
  acaoAId = action.id;
});

afterAll(async () => {
  await db.delete(acaoTarefasTable).where(eq(acaoTarefasTable.acaoId, acaoAId));
  await db.delete(actionsTable).where(eq(actionsTable.clinicId, clinicAId));
  await db.delete(teamTable).where(eq(teamTable.clinicId, clinicAId));
  await db.delete(teamTable).where(eq(teamTable.clinicId, clinicBId));
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicAId));
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicBId));
});

beforeEach(async () => {
  await db.delete(acaoTarefasTable).where(eq(acaoTarefasTable.acaoId, acaoAId));
  sendEmailMock.mockClear();
  sendPushToEmailMock.mockClear();
  getRecipientPrefsMock.mockClear();
});

describe("POST /actions/:id/tarefas", () => {
  it("creates a tarefa and notifies the responsável clinic-scoped", async () => {
    const res = await request(app)
      .post(`/api/actions/${acaoAId}/tarefas`)
      .set("Authorization", `Bearer ${teamMemberToken(gestorEmail)}`)
      .send({ titulo: "Primeira tarefa", responsavelEmail: gestorEmail });

    expect(res.status).toBe(201);
    expect(res.body.titulo).toBe("Primeira tarefa");
    expect(res.body.status).toBe("a_fazer");
    expect(res.body.subtarefas).toEqual([]);

    // notifyTarefaAssigned is fire-and-forget; push is clinic-scoped.
    await waitFor(() => {
      expect(sendPushToEmailMock).toHaveBeenCalledWith(
        gestorEmail,
        clinicAId,
        expect.any(Object),
      );
    });
  });

  it("rejects a responsável that is not on the clinic team", async () => {
    const res = await request(app)
      .post(`/api/actions/${acaoAId}/tarefas`)
      .set("Authorization", `Bearer ${teamMemberToken(gestorEmail)}`)
      .send({ titulo: "Tarefa inválida", responsavelEmail: outsiderEmail });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Responsável inválido/i);
    expect(sendPushToEmailMock).not.toHaveBeenCalled();
  });

  it("denies a team_member without access to the action's clinic", async () => {
    const res = await request(app)
      .post(`/api/actions/${acaoAId}/tarefas`)
      .set("Authorization", `Bearer ${teamMemberToken(outsiderEmail)}`)
      .send({ titulo: "Tarefa intrusa" });

    expect(res.status).toBe(403);
  });
});

describe("PATCH /actions/:id/tarefas/:tarefaId", () => {
  it("stamps concluidaEm when status becomes concluida", async () => {
    const [t] = await db
      .insert(acaoTarefasTable)
      .values({ acaoId: acaoAId, titulo: "A concluir", status: "a_fazer" })
      .returning();

    const res = await request(app)
      .patch(`/api/actions/${acaoAId}/tarefas/${t.id}`)
      .set("Authorization", `Bearer ${teamMemberToken(gestorEmail)}`)
      .send({ status: "concluida" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("concluida");
    expect(res.body.concluidaEm).not.toBeNull();
  });

  it("notifies on reassignment with a clinic-scoped /acao deep link", async () => {
    const [t] = await db
      .insert(acaoTarefasTable)
      .values({ acaoId: acaoAId, titulo: "A atribuir", status: "a_fazer" })
      .returning();

    const res = await request(app)
      .patch(`/api/actions/${acaoAId}/tarefas/${t.id}`)
      .set("Authorization", `Bearer ${teamMemberToken(gestorEmail)}`)
      .send({ responsavelEmail: gestorEmail });

    expect(res.status).toBe(200);

    // Reassignment fires the same fire-and-forget notification as create. The
    // push must be clinic-scoped and deep-link to the canonical `acao` section
    // (`plano-de-acao` renders a blank PainelClinica section).
    await waitFor(() => {
      expect(sendPushToEmailMock).toHaveBeenCalledWith(
        gestorEmail,
        clinicAId,
        expect.objectContaining({
          url: `/portal/clinica/${clinicAId}/acao`,
        }),
      );
    });
  });

  it("rejects a responsável outside the clinic team on PATCH", async () => {
    const [t] = await db
      .insert(acaoTarefasTable)
      .values({ acaoId: acaoAId, titulo: "Reatribuir inválido", status: "a_fazer" })
      .returning();

    const res = await request(app)
      .patch(`/api/actions/${acaoAId}/tarefas/${t.id}`)
      .set("Authorization", `Bearer ${teamMemberToken(gestorEmail)}`)
      .send({ responsavelEmail: outsiderEmail });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Responsável inválido/i);
    expect(sendPushToEmailMock).not.toHaveBeenCalled();
  });
});

describe("subtarefa nesting", () => {
  it("allows one level but rejects a subtarefa of a subtarefa", async () => {
    // Top-level tarefa.
    const top = await request(app)
      .post(`/api/actions/${acaoAId}/tarefas`)
      .set("Authorization", `Bearer ${teamMemberToken(gestorEmail)}`)
      .send({ titulo: "Tarefa topo" });
    expect(top.status).toBe(201);

    // First level subtarefa — allowed.
    const sub = await request(app)
      .post(`/api/actions/${acaoAId}/tarefas`)
      .set("Authorization", `Bearer ${teamMemberToken(gestorEmail)}`)
      .send({ titulo: "Subtarefa", parentTarefaId: top.body.id });
    expect(sub.status).toBe(201);
    expect(sub.body.parentTarefaId).toBe(top.body.id);

    // Second level — rejected (one level only).
    const deep = await request(app)
      .post(`/api/actions/${acaoAId}/tarefas`)
      .set("Authorization", `Bearer ${teamMemberToken(gestorEmail)}`)
      .send({ titulo: "Sub da sub", parentTarefaId: sub.body.id });
    expect(deep.status).toBe(400);
    expect(deep.body.error).toMatch(/não podem ter subtarefas/i);
  });
});

describe("GET /clinics/:clinicId/tarefas", () => {
  it("scopes a team_member to their own tarefas", async () => {
    await db.insert(acaoTarefasTable).values([
      { acaoId: acaoAId, titulo: "Minha", responsavelEmail: gestorEmail },
      { acaoId: acaoAId, titulo: "De outro", responsavelEmail: `other-${suffix}@x.com` },
    ]);

    const res = await request(app)
      .get(`/api/clinics/${clinicAId}/tarefas`)
      .set("Authorization", `Bearer ${teamMemberToken(gestorEmail)}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].titulo).toBe("Minha");
    expect(res.body[0].acaoTitulo).toBe(`Ação A ${suffix}`);
  });
});
