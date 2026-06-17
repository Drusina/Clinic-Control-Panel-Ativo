import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";

const {
  sendEmailMock,
  sendPushToEmailMock,
  getRecipientPrefsMock,
  sendReminderWhatsAppMock,
  isWhatsAppConfiguredMock,
} = vi.hoisted(() => ({
  sendEmailMock: vi.fn(async () => true),
  sendPushToEmailMock: vi.fn(async () => ({ sent: 1, failed: 0 })),
  getRecipientPrefsMock: vi.fn(async () => ({
    emailEnabled: true,
    whatsappEnabled: false,
  })),
  sendReminderWhatsAppMock: vi.fn(async () => true),
  isWhatsAppConfiguredMock: vi.fn(() => true),
}));

vi.mock("./email.js", () => ({
  sendEmail: sendEmailMock,
  buildReminderEmail: vi.fn(() => "<html>reminder</html>"),
  resolveAppUrl: vi.fn(async () => "https://app.test"),
}));
vi.mock("./push.js", () => ({
  sendPushToEmail: sendPushToEmailMock,
}));
vi.mock("./preferences.js", () => ({
  getRecipientPrefs: getRecipientPrefsMock,
}));
vi.mock("./whatsapp.js", () => ({
  sendReminderWhatsApp: sendReminderWhatsAppMock,
  isWhatsAppConfigured: isWhatsAppConfiguredMock,
}));

import {
  db,
  clinicsTable,
  compromissosTable,
  notificationsTable,
  teamTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { runReminderCheck } from "./reminder-check.js";

const suffix = randomUUID().slice(0, 8);
let clinicId: string;
let clinicNoEmailId: string;

function minutesFromNow(min: number): Date {
  return new Date(Date.now() + min * 60_000);
}

beforeAll(async () => {
  const [c1] = await db
    .insert(clinicsTable)
    .values({
      nome: `Reminder Clinic ${suffix}`,
      cnpj: `rem-${suffix}`,
      email: `clinic-${suffix}@example.com`,
    })
    .returning();
  clinicId = c1.id;

  const [c2] = await db
    .insert(clinicsTable)
    .values({ nome: `Reminder NoEmail ${suffix}`, cnpj: `rem-ne-${suffix}` })
    .returning();
  clinicNoEmailId = c2.id;
});

afterAll(async () => {
  await db.delete(teamTable).where(eq(teamTable.clinicId, clinicId));
  await db.delete(compromissosTable).where(eq(compromissosTable.clinicId, clinicId));
  await db.delete(compromissosTable).where(eq(compromissosTable.clinicId, clinicNoEmailId));
  await db.delete(notificationsTable).where(eq(notificationsTable.clinicId, clinicId));
  await db.delete(notificationsTable).where(eq(notificationsTable.clinicId, clinicNoEmailId));
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicId));
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicNoEmailId));
});

beforeEach(async () => {
  await db.delete(compromissosTable).where(eq(compromissosTable.clinicId, clinicId));
  await db.delete(compromissosTable).where(eq(compromissosTable.clinicId, clinicNoEmailId));
  await db.delete(notificationsTable).where(eq(notificationsTable.clinicId, clinicId));
  await db.delete(notificationsTable).where(eq(notificationsTable.clinicId, clinicNoEmailId));
  await db.delete(teamTable).where(eq(teamTable.clinicId, clinicId));
  sendEmailMock.mockClear();
  sendPushToEmailMock.mockClear();
  getRecipientPrefsMock.mockClear();
  sendReminderWhatsAppMock.mockClear();
  sendReminderWhatsAppMock.mockResolvedValue(true);
  isWhatsAppConfiguredMock.mockClear();
  isWhatsAppConfiguredMock.mockReturnValue(true);
});

describe("runReminderCheck — atomic claim + dispatch", () => {
  it("claims a due appointment, sends email + push, writes a notification, and is idempotent", async () => {
    const [due] = await db
      .insert(compromissosTable)
      .values({
        clinicId,
        tipo: "reuniao",
        titulo: "Reunião due",
        inicio: minutesFromNow(30),
        status: "agendado",
        lembreteMinutosAntes: 60,
        responsavelEmail: `resp-${suffix}@example.com`,
      })
      .returning();

    const first = await runReminderCheck();
    expect(first.claimed).toBe(1);
    expect(first.emailsSent).toBe(1);
    expect(first.pushSent).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPushToEmailMock).toHaveBeenCalledTimes(1);
    // Push must be resolved with the clinicId to prevent cross-clinic leaks,
    // and the deep link must target the real clinic-scoped agenda route (there
    // is no bare `/agenda` route in the app).
    expect(sendPushToEmailMock).toHaveBeenCalledWith(
      `resp-${suffix}@example.com`,
      clinicId,
      expect.objectContaining({ url: `/portal/clinica/${clinicId}/agenda` }),
    );

    const [row] = await db
      .select()
      .from(compromissosTable)
      .where(eq(compromissosTable.id, due.id));
    expect(row.lembreteEnviadoEm).not.toBeNull();

    const notifs = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.clinicId, clinicId));
    expect(notifs).toHaveLength(1);
    expect(notifs[0].tipo).toBe("lembrete_compromisso");
    // In-app notification must deep link to the real clinic-scoped agenda route.
    expect(notifs[0].acaoUrl).toBe(`/portal/clinica/${clinicId}/agenda`);

    // Second run must claim nothing — the stamp blocks re-sends.
    const second = await runReminderCheck();
    expect(second.claimed).toBe(0);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("does not claim appointments outside the reminder window, already sent, or not scheduled", async () => {
    await db.insert(compromissosTable).values([
      // Too far in the future (window not open yet).
      {
        clinicId,
        titulo: "Far future",
        inicio: minutesFromNow(60 * 24),
        status: "agendado",
        lembreteMinutosAntes: 60,
        responsavelEmail: `resp-${suffix}@example.com`,
      },
      // Already reminded.
      {
        clinicId,
        titulo: "Already sent",
        inicio: minutesFromNow(30),
        status: "agendado",
        lembreteMinutosAntes: 60,
        lembreteEnviadoEm: new Date(),
        responsavelEmail: `resp-${suffix}@example.com`,
      },
      // Not scheduled.
      {
        clinicId,
        titulo: "Cancelled",
        inicio: minutesFromNow(30),
        status: "cancelado",
        lembreteMinutosAntes: 60,
        responsavelEmail: `resp-${suffix}@example.com`,
      },
      // No reminder offset.
      {
        clinicId,
        titulo: "No offset",
        inicio: minutesFromNow(30),
        status: "agendado",
        responsavelEmail: `resp-${suffix}@example.com`,
      },
      // In the past (already started).
      {
        clinicId,
        titulo: "Past",
        inicio: minutesFromNow(-30),
        status: "agendado",
        lembreteMinutosAntes: 60,
        responsavelEmail: `resp-${suffix}@example.com`,
      },
    ]);

    const result = await runReminderCheck();
    expect(result.claimed).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("claims an appointment with no recipient but still records the in-app notification without emailing", async () => {
    await db.insert(compromissosTable).values({
      clinicId: clinicNoEmailId,
      titulo: "Sem destinatário",
      inicio: minutesFromNow(30),
      status: "agendado",
      lembreteMinutosAntes: 60,
    });

    const result = await runReminderCheck();
    expect(result.claimed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.emailsSent).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();

    const notifs = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.clinicId, clinicNoEmailId));
    expect(notifs).toHaveLength(1);
  });

  it("skips email when recipient muted email but still sends push", async () => {
    getRecipientPrefsMock.mockResolvedValueOnce({
      emailEnabled: false,
      whatsappEnabled: false,
    });

    await db.insert(compromissosTable).values({
      clinicId,
      titulo: "Email muted",
      inicio: minutesFromNow(30),
      status: "agendado",
      lembreteMinutosAntes: 60,
      responsavelEmail: `resp-${suffix}@example.com`,
    });

    const result = await runReminderCheck();
    expect(result.claimed).toBe(1);
    expect(result.emailsSent).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendPushToEmailMock).toHaveBeenCalledTimes(1);
  });

  it("sends a WhatsApp reminder when the recipient opted in and has a clinic-scoped phone", async () => {
    getRecipientPrefsMock.mockResolvedValueOnce({
      emailEnabled: true,
      whatsappEnabled: true,
    });
    await db.insert(teamTable).values({
      clinicId,
      nome: "Resp WhatsApp",
      email: `resp-${suffix}@example.com`,
      whatsapp: "+55 11 99999-0000",
    });

    await db.insert(compromissosTable).values({
      clinicId,
      titulo: "WhatsApp reminder",
      inicio: minutesFromNow(30),
      status: "agendado",
      lembreteMinutosAntes: 60,
      responsavelEmail: `resp-${suffix}@example.com`,
    });

    const result = await runReminderCheck();
    expect(result.claimed).toBe(1);
    expect(result.whatsappSent).toBe(1);
    expect(sendReminderWhatsAppMock).toHaveBeenCalledTimes(1);
    expect(sendReminderWhatsAppMock).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "+55 11 99999-0000",
        titulo: "WhatsApp reminder",
      }),
    );
  });

  it("does not send WhatsApp when the recipient muted the channel", async () => {
    getRecipientPrefsMock.mockResolvedValueOnce({
      emailEnabled: true,
      whatsappEnabled: false,
    });
    await db.insert(teamTable).values({
      clinicId,
      nome: "Resp WhatsApp Muted",
      email: `resp-${suffix}@example.com`,
      whatsapp: "+55 11 99999-0000",
    });

    await db.insert(compromissosTable).values({
      clinicId,
      titulo: "WhatsApp muted",
      inicio: minutesFromNow(30),
      status: "agendado",
      lembreteMinutosAntes: 60,
      responsavelEmail: `resp-${suffix}@example.com`,
    });

    const result = await runReminderCheck();
    expect(result.claimed).toBe(1);
    expect(result.whatsappSent).toBe(0);
    expect(sendReminderWhatsAppMock).not.toHaveBeenCalled();
  });

  it("does not send WhatsApp when the recipient has no phone on record", async () => {
    getRecipientPrefsMock.mockResolvedValueOnce({
      emailEnabled: true,
      whatsappEnabled: true,
    });

    await db.insert(compromissosTable).values({
      clinicId,
      titulo: "WhatsApp no phone",
      inicio: minutesFromNow(30),
      status: "agendado",
      lembreteMinutosAntes: 60,
      responsavelEmail: `resp-${suffix}@example.com`,
    });

    const result = await runReminderCheck();
    expect(result.claimed).toBe(1);
    expect(result.whatsappSent).toBe(0);
    expect(sendReminderWhatsAppMock).not.toHaveBeenCalled();
  });

  it("releases the claim for retry when the reminder cannot be recorded, then succeeds next run", async () => {
    const [due] = await db
      .insert(compromissosTable)
      .values({
        clinicId,
        titulo: "Falha transitória",
        inicio: minutesFromNow(30),
        status: "agendado",
        lembreteMinutosAntes: 60,
        responsavelEmail: `resp-${suffix}@example.com`,
      })
      .returning();

    // Force the canonical in-app notification insert to fail on this run. The
    // claim stamps the row first, so without the release-on-failure safeguard
    // the reminder would be silently lost forever.
    const insertSpy = vi.spyOn(db, "insert").mockImplementationOnce(() => {
      throw new Error("simulated notification insert failure");
    });

    const failed = await runReminderCheck();
    insertSpy.mockRestore();

    expect(failed.claimed).toBe(1);
    expect(failed.requeued).toBe(1);
    expect(failed.emailsSent).toBe(0);
    // Nothing reached the user, so no external channel should have fired.
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendPushToEmailMock).not.toHaveBeenCalled();

    // The claim must have been released back to NULL so the row is due again.
    const [afterFail] = await db
      .select()
      .from(compromissosTable)
      .where(eq(compromissosTable.id, due.id));
    expect(afterFail.lembreteEnviadoEm).toBeNull();

    // No partial in-app notification should linger from the failed run.
    const notifsAfterFail = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.clinicId, clinicId));
    expect(notifsAfterFail).toHaveLength(0);

    // Next tick retries and delivers cleanly — exactly once.
    const retried = await runReminderCheck();
    expect(retried.claimed).toBe(1);
    expect(retried.requeued).toBe(0);
    expect(retried.emailsSent).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPushToEmailMock).toHaveBeenCalledTimes(1);

    const [afterRetry] = await db
      .select()
      .from(compromissosTable)
      .where(eq(compromissosTable.id, due.id));
    expect(afterRetry.lembreteEnviadoEm).not.toBeNull();

    const notifsAfterRetry = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.clinicId, clinicId));
    expect(notifsAfterRetry).toHaveLength(1);
  });
});
