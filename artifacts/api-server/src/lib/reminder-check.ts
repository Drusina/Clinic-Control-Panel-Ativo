import {
  db,
  compromissosTable,
  clinicsTable,
  notificationsTable,
} from "@workspace/db";
import { and, eq, gt, lte, isNull, isNotNull, sql } from "drizzle-orm";
import { sendEmail, buildReminderEmail, resolveAppUrl } from "./email.js";
import { getRecipientPrefs } from "./preferences.js";
import { sendPushToEmail } from "./push.js";
import { logger } from "./logger.js";

const TIPO_LABEL: Record<string, string> = {
  reuniao: "reunião",
  tarefa: "tarefa",
  marco: "marco",
};

function formatQuando(inicio: Date, diaInteiro: boolean): string {
  const tz = "America/Sao_Paulo";
  if (diaInteiro) {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "full",
      timeZone: tz,
    }).format(inicio);
  }
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: tz,
  }).format(inicio);
}

/**
 * Find appointments whose reminder window has opened and dispatch a single
 * reminder per appointment (email + web push). Idempotency is enforced by an
 * ATOMIC CLAIM: the UPDATE stamps `lembrete_enviado_em` while it is still NULL
 * and returns only the rows it actually claimed, so concurrent workers (and
 * overlapping cron ticks) can never send the same reminder twice.
 *
 * "Due" means: status = 'agendado', a reminder offset is set, the reminder has
 * not been sent yet, the appointment is still in the future, and now() has
 * reached `inicio - lembreteMinutosAntes`.
 *
 * WhatsApp is intentionally skipped — there is no approved Meta template for
 * appointment reminders.
 */
export async function runReminderCheck(): Promise<{
  claimed: number;
  emailsSent: number;
  pushSent: number;
  skipped: number;
}> {
  const claimed = await db
    .update(compromissosTable)
    .set({ lembreteEnviadoEm: new Date() })
    .where(
      and(
        eq(compromissosTable.status, "agendado"),
        isNull(compromissosTable.lembreteEnviadoEm),
        isNotNull(compromissosTable.lembreteMinutosAntes),
        gt(compromissosTable.inicio, sql`now()`),
        lte(
          compromissosTable.inicio,
          sql`now() + (${compromissosTable.lembreteMinutosAntes} * interval '1 minute')`,
        ),
      ),
    )
    .returning();

  if (claimed.length === 0) {
    return { claimed: 0, emailsSent: 0, pushSent: 0, skipped: 0 };
  }

  const appUrl = await resolveAppUrl();
  let emailsSent = 0;
  let pushSent = 0;
  let skipped = 0;

  for (const appt of claimed) {
    try {
      const [clinic] = await db
        .select({ nome: clinicsTable.nome, email: clinicsTable.email })
        .from(clinicsTable)
        .where(eq(clinicsTable.id, appt.clinicId))
        .limit(1);

      const recipient = appt.responsavelEmail?.trim() || clinic?.email?.trim() || null;
      const clinicName = clinic?.nome ?? "Clínica";
      const tipoLabel = TIPO_LABEL[appt.tipo] ?? appt.tipo;
      const quando = formatQuando(appt.inicio, appt.diaInteiro);

      const agendaPath = `/portal/clinica/${appt.clinicId}/agenda`;

      // Persist an in-app notification regardless of channel preferences so the
      // bell shows the reminder even when email is muted.
      await db.insert(notificationsTable).values({
        clinicId: appt.clinicId,
        tipo: "lembrete_compromisso",
        titulo: `Lembrete: ${appt.titulo}`,
        mensagem: `${tipoLabel.charAt(0).toUpperCase()}${tipoLabel.slice(1)} em ${quando}.`,
        acaoUrl: agendaPath,
      });

      if (!recipient) {
        skipped++;
        continue;
      }

      // Web push — clinic-scoped resolution so a duplicate email across clinics
      // can never receive another clinic's reminder.
      const pushRes = await sendPushToEmail(recipient, appt.clinicId, {
        title: `Lembrete: ${appt.titulo}`,
        body: `${tipoLabel.charAt(0).toUpperCase()}${tipoLabel.slice(1)} em ${quando}${clinicName ? ` — ${clinicName}` : ""}.`,
        url: agendaPath,
        tag: `compromisso-${appt.id}`,
      }).catch(() => ({ sent: 0, failed: 0 }));
      pushSent += pushRes.sent;

      const prefs = await getRecipientPrefs(recipient, appt.clinicId);
      if (prefs.emailEnabled) {
        const html = buildReminderEmail({
          clinicName,
          titulo: appt.titulo,
          tipoLabel,
          quando,
          local: appt.local,
          descricao: appt.descricao,
          appUrl,
          agendaPath,
        });
        const ok = await sendEmail({
          to: recipient,
          subject: `[IONEX360] Lembrete: ${appt.titulo} — ${quando}`,
          html,
        });
        if (ok) emailsSent++;
      }
    } catch (err) {
      logger.error(
        { err, compromissoId: appt.id, clinicId: appt.clinicId },
        "Failed to dispatch appointment reminder",
      );
      skipped++;
    }
  }

  return { claimed: claimed.length, emailsSent, pushSent, skipped };
}
