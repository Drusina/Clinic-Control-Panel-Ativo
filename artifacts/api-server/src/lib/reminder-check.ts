import {
  db,
  compromissosTable,
  clinicsTable,
  notificationsTable,
  teamTable,
} from "@workspace/db";
import { and, eq, gt, lte, isNull, isNotNull, sql } from "drizzle-orm";
import { sendEmail, buildReminderEmail, resolveAppUrl } from "./email.js";
import { getRecipientPrefs } from "./preferences.js";
import { sendPushToEmail } from "./push.js";
import { sendReminderWhatsApp, isWhatsAppConfigured } from "./whatsapp.js";
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
 * reminder per appointment. Idempotency is enforced by an ATOMIC CLAIM: the
 * UPDATE stamps `lembrete_enviado_em` while it is still NULL and returns only
 * the rows it actually claimed, so concurrent workers (and overlapping cron
 * ticks) can never send the same reminder twice.
 *
 * "Due" means: status = 'agendado', a reminder offset is set, the reminder has
 * not been sent yet, the appointment is still in the future, and now() has
 * reached `inicio - lembreteMinutosAntes`.
 *
 * Delivery channels:
 *  - In-app notification (the bell) is the CANONICAL reminder record. It is
 *    persisted regardless of channel preferences, so the user always has the
 *    reminder in-app even when email is muted.
 *  - Web push + email + WhatsApp are best-effort enhancements layered on top;
 *    their failures are swallowed and never resurface the reminder (which would
 *    duplicate the bell entry / risk a duplicate email).
 *
 * Fault tolerance: because the claim stamps the row BEFORE dispatch, a failure
 * that prevents us from even recording the reminder (clinic lookup error,
 * notification insert error, etc.) would otherwise silently drop it forever.
 * To avoid that, when a row could not be recorded we RELEASE the claim
 * (`lembrete_enviado_em` back to NULL) so the next cron tick retries it.
 *
 * WhatsApp uses the pre-approved `lembrete_compromisso` Meta Cloud template and
 * follows the same graceful-fallback pattern as the delegation/approval senders:
 * it only fires when the channel is configured, the recipient has a phone on
 * their `equipe_interna` record, and they have not muted WhatsApp in their
 * notification preferences. A send failure is swallowed (best-effort) just like
 * push and email.
 */
export async function runReminderCheck(): Promise<{
  claimed: number;
  emailsSent: number;
  pushSent: number;
  whatsappSent: number;
  skipped: number;
  requeued: number;
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
    return { claimed: 0, emailsSent: 0, pushSent: 0, whatsappSent: 0, skipped: 0, requeued: 0 };
  }

  const appUrl = await resolveAppUrl();
  let emailsSent = 0;
  let pushSent = 0;
  let whatsappSent = 0;
  let skipped = 0;
  let requeued = 0;

  for (const appt of claimed) {
    // `recorded` flips to true once the canonical in-app notification is
    // written. While it is false the reminder has reached nobody, so the claim
    // must be released for a retry rather than left stamped (= silently lost).
    let recorded = false;
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
      // bell shows the reminder even when email is muted. This is the canonical
      // delivery — once it succeeds the reminder counts as delivered.
      await db.insert(notificationsTable).values({
        clinicId: appt.clinicId,
        tipo: "lembrete_compromisso",
        titulo: `Lembrete: ${appt.titulo}`,
        mensagem: `${tipoLabel.charAt(0).toUpperCase()}${tipoLabel.slice(1)} em ${quando}.`,
        acaoUrl: agendaPath,
      });
      recorded = true;

      if (!recipient) {
        skipped++;
        continue;
      }

      // Web push — clinic-scoped resolution so a duplicate email across clinics
      // can never receive another clinic's reminder. Best-effort: a provider
      // failure is swallowed so it cannot resurface the (already delivered)
      // in-app reminder.
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
        // Best-effort: swallow provider failures (see push note above).
        const ok = await sendEmail({
          to: recipient,
          subject: `[IONEX360] Lembrete: ${appt.titulo} — ${quando}`,
          html,
        }).catch(() => false);
        if (ok) emailsSent++;
      }

      // WhatsApp — uses the pre-approved `lembrete_compromisso` template. Only
      // fires when the channel is configured, the recipient opted in, and they
      // have a phone on their `equipe_interna` record for this clinic. Resolved
      // clinic-scoped (email + clinicId) so a duplicate email across clinics can
      // never receive another clinic's number. Best-effort: failures swallowed.
      if (prefs.whatsappEnabled && isWhatsAppConfigured()) {
        const [member] = await db
          .select({ whatsapp: teamTable.whatsapp })
          .from(teamTable)
          .where(
            and(
              eq(teamTable.clinicId, appt.clinicId),
              sql`lower(${teamTable.email}) = lower(${recipient})`,
            ),
          )
          .limit(1);
        const phone = member?.whatsapp?.trim();
        if (phone) {
          const sent = await sendReminderWhatsApp({
            phone,
            titulo: appt.titulo,
            quando,
            clinicName,
          }).catch(() => false);
          if (sent) whatsappSent++;
        }
      }
    } catch (err) {
      logger.error(
        { err, compromissoId: appt.id, clinicId: appt.clinicId },
        "Failed to dispatch appointment reminder",
      );
    } finally {
      if (!recorded) {
        // The reminder reached nobody (failure before the in-app notification
        // was written). Release the claim so the next tick retries instead of
        // dropping it forever. Because nothing was delivered, retrying cannot
        // duplicate the bell or the email.
        await db
          .update(compromissosTable)
          .set({ lembreteEnviadoEm: null })
          .where(eq(compromissosTable.id, appt.id))
          .catch((err) => {
            logger.error(
              { err, compromissoId: appt.id },
              "Failed to release reminder claim for retry",
            );
          });
        requeued++;
      }
    }
  }

  return { claimed: claimed.length, emailsSent, pushSent, whatsappSent, skipped, requeued };
}
