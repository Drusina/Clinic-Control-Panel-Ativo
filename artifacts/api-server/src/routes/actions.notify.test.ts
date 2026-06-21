import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";

const { sendEmailMock, sendPushToEmailMock, getRecipientPrefsMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(async () => true),
  sendPushToEmailMock: vi.fn(async () => ({ sent: 1, failed: 0 })),
  getRecipientPrefsMock: vi.fn(async () => ({ emailEnabled: true, whatsappEnabled: false })),
}));

vi.mock("../lib/email.js", () => ({
  sendEmail: sendEmailMock,
  buildActionUpdateEmail: vi.fn(() => "<html>update</html>"),
  resolveAppUrl: vi.fn(async () => "https://app.test"),
}));
vi.mock("../lib/push.js", () => ({
  sendPushToEmail: sendPushToEmailMock,
}));
vi.mock("../lib/preferences.js", () => ({
  getRecipientPrefs: getRecipientPrefsMock,
}));

import { db, clinicsTable, actionsTable, teamTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { notifyResponsavelOfActionUpdate } from "./actions";

const suffix = randomUUID().slice(0, 8);
const respEmail = `resp-${suffix}@example.com`;
const respNome = "Responsável Teste";
let clinicId: string;
let otherClinicId: string;

beforeAll(async () => {
  const [c1] = await db
    .insert(clinicsTable)
    .values({ nome: `Actions Notify ${suffix}`, cnpj: `an-${suffix}` })
    .returning();
  clinicId = c1.id;

  const [c2] = await db
    .insert(clinicsTable)
    .values({ nome: `Actions Notify Other ${suffix}`, cnpj: `an-o-${suffix}` })
    .returning();
  otherClinicId = c2.id;

  // Responsável on the target clinic.
  await db.insert(teamTable).values({
    clinicId,
    nome: respNome,
    email: respEmail,
    temAcessoPlataforma: true,
  });

  // A namesake on ANOTHER clinic with a different email — must never receive
  // notifications for this clinic's actions (clinic-scoped resolution).
  await db.insert(teamTable).values({
    clinicId: otherClinicId,
    nome: respNome,
    email: `other-${suffix}@example.com`,
    temAcessoPlataforma: true,
  });
});

afterAll(async () => {
  await db.delete(actionsTable).where(eq(actionsTable.clinicId, clinicId));
  await db.delete(teamTable).where(eq(teamTable.clinicId, clinicId));
  await db.delete(teamTable).where(eq(teamTable.clinicId, otherClinicId));
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicId));
  await db.delete(clinicsTable).where(eq(clinicsTable.id, otherClinicId));
});

beforeEach(() => {
  sendEmailMock.mockClear();
  sendPushToEmailMock.mockClear();
  getRecipientPrefsMock.mockClear();
  getRecipientPrefsMock.mockResolvedValue({ emailEnabled: true, whatsappEnabled: false });
});

async function makeAction(responsavelNome: string | null): Promise<typeof actionsTable.$inferSelect> {
  const [a] = await db
    .insert(actionsTable)
    .values({ clinicId, titulo: `Ação ${suffix}`, responsavelNome })
    .returning();
  return a;
}

describe("notifyResponsavelOfActionUpdate", () => {
  it("notifies the responsável by clinic-scoped name match — email + push (checklist)", async () => {
    const action = await makeAction(respNome);

    await notifyResponsavelOfActionUpdate("checklist", action, "Novo item importante");

    expect(sendPushToEmailMock).toHaveBeenCalledTimes(1);
    // Push must resolve with the clinicId (cross-clinic leak guard) and deep
    // link to the clinic-scoped action-plan route (`acao` is the canonical
    // PainelClinica section slug; `plano-de-acao` renders a blank section).
    expect(sendPushToEmailMock).toHaveBeenCalledWith(
      respEmail,
      clinicId,
      expect.objectContaining({ url: `/portal/clinica/${clinicId}/acao` }),
    );
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: respEmail }),
    );
  });

  it("notifies the responsável for a note as well (nota)", async () => {
    const action = await makeAction(respNome);

    await notifyResponsavelOfActionUpdate("nota", action, "Observação do coordenador");

    expect(sendPushToEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("matches the responsável name case-insensitively", async () => {
    const action = await makeAction(respNome.toUpperCase());

    await notifyResponsavelOfActionUpdate("checklist", action, "Item");

    expect(sendPushToEmailMock).toHaveBeenCalledWith(
      respEmail,
      clinicId,
      expect.anything(),
    );
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("skips email when the recipient muted email but still sends push", async () => {
    getRecipientPrefsMock.mockResolvedValueOnce({ emailEnabled: false, whatsappEnabled: false });
    const action = await makeAction(respNome);

    await notifyResponsavelOfActionUpdate("checklist", action, "Item");

    expect(sendPushToEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("does nothing when the action has no responsável", async () => {
    const action = await makeAction(null);

    await notifyResponsavelOfActionUpdate("nota", action, "Nota órfã");

    expect(sendPushToEmailMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("does nothing when no team member matches the responsável name", async () => {
    const action = await makeAction("Pessoa Inexistente");

    await notifyResponsavelOfActionUpdate("checklist", action, "Item");

    expect(sendPushToEmailMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
