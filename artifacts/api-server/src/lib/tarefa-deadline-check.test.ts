import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";

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

vi.mock("./email.js", () => ({
  sendEmail: sendEmailMock,
  buildTarefaDeadlineEmail: vi.fn(() => "<html>deadline</html>"),
  resolveAppUrl: vi.fn(async () => "https://app.test"),
}));
vi.mock("./push.js", () => ({
  sendPushToEmail: sendPushToEmailMock,
}));
vi.mock("./preferences.js", () => ({
  getRecipientPrefs: getRecipientPrefsMock,
}));

import {
  db,
  clinicsTable,
  actionsTable,
  acaoTarefasTable,
  notificationsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { runTarefaDeadlineCheck } from "./tarefa-deadline-check.js";

const suffix = randomUUID().slice(0, 8);
const responsavelEmail = `resp-${suffix}@example.com`;
let clinicId: string;
let acaoId: string;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

beforeAll(async () => {
  const [c] = await db
    .insert(clinicsTable)
    .values({ nome: `Deadline ${suffix}`, cnpj: `dl-${suffix}` })
    .returning();
  clinicId = c.id;

  const [a] = await db
    .insert(actionsTable)
    .values({ clinicId, titulo: `Ação prazo ${suffix}` })
    .returning();
  acaoId = a.id;
});

afterAll(async () => {
  await db.delete(acaoTarefasTable).where(eq(acaoTarefasTable.acaoId, acaoId));
  await db
    .delete(notificationsTable)
    .where(eq(notificationsTable.clinicId, clinicId));
  await db.delete(actionsTable).where(eq(actionsTable.clinicId, clinicId));
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicId));
});

beforeEach(async () => {
  await db.delete(acaoTarefasTable).where(eq(acaoTarefasTable.acaoId, acaoId));
  await db
    .delete(notificationsTable)
    .where(eq(notificationsTable.clinicId, clinicId));
  sendEmailMock.mockClear();
  sendPushToEmailMock.mockClear();
  getRecipientPrefsMock.mockClear();
});

describe("runTarefaDeadlineCheck", () => {
  it("claims only due tarefas, dispatches once, and is idempotent", async () => {
    // Due: prazo today, open, has responsável → claimed.
    await db.insert(acaoTarefasTable).values({
      acaoId,
      titulo: "Devida",
      responsavelEmail,
      responsavelNome: "Resp",
      prazo: todayUtc(),
      status: "a_fazer",
    });
    // Completed → never reminded.
    await db.insert(acaoTarefasTable).values({
      acaoId,
      titulo: "Concluída",
      responsavelEmail,
      prazo: todayUtc(),
      status: "concluida",
    });
    // No responsável → skipped by the claim WHERE.
    await db.insert(acaoTarefasTable).values({
      acaoId,
      titulo: "Sem responsável",
      prazo: todayUtc(),
      status: "a_fazer",
    });
    // Far future → not yet due.
    await db.insert(acaoTarefasTable).values({
      acaoId,
      titulo: "Futura",
      responsavelEmail,
      prazo: "2999-12-31",
      status: "a_fazer",
    });

    const res = await runTarefaDeadlineCheck();
    expect(res.claimed).toBe(1);
    expect(res.emailsSent).toBe(1);
    expect(res.pushSent).toBe(1);
    expect(sendPushToEmailMock).toHaveBeenCalledTimes(1);
    // Push is resolved clinic-scoped.
    expect(sendPushToEmailMock).toHaveBeenCalledWith(
      responsavelEmail,
      clinicId,
      expect.any(Object),
    );

    // Canonical in-app notification persisted.
    const notes = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.clinicId, clinicId));
    expect(notes).toHaveLength(1);
    expect(notes[0].tipo).toBe("lembrete_tarefa");

    // Re-running claims nothing (dedup via lembrete_prazo_enviado_em).
    sendPushToEmailMock.mockClear();
    sendEmailMock.mockClear();
    const second = await runTarefaDeadlineCheck();
    expect(second.claimed).toBe(0);
    expect(sendPushToEmailMock).not.toHaveBeenCalled();
  });

  it("releases the claim when the reminder cannot be recorded", async () => {
    // Whitespace-only email passes the NOT NULL claim filter but trims to null,
    // so the row is claimed, then skipped, and the claim is released for retry.
    const [t] = await db
      .insert(acaoTarefasTable)
      .values({
        acaoId,
        titulo: "Sem destino real",
        responsavelEmail: "   ",
        prazo: todayUtc(),
        status: "a_fazer",
      })
      .returning();

    const res = await runTarefaDeadlineCheck();
    expect(res.claimed).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.requeued).toBe(1);
    expect(sendPushToEmailMock).not.toHaveBeenCalled();

    // No notification recorded and the claim was released (re-armed).
    const notes = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.clinicId, clinicId));
    expect(notes).toHaveLength(0);

    const [after] = await db
      .select()
      .from(acaoTarefasTable)
      .where(eq(acaoTarefasTable.id, t.id));
    expect(after.lembretePrazoEnviadoEm).toBeNull();
  });
});
