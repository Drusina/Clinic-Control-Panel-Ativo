import {
  db,
  acaoTarefasTable,
  actionsTable,
  clinicsTable,
  notificationsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { sendEmail, buildTarefaDeadlineEmail, resolveAppUrl } from "./email.js";
import { getRecipientPrefs } from "./preferences.js";
import { sendPushToEmail } from "./push.js";
import { logger } from "./logger.js";

/** Render a YYYY-MM-DD date string as DD/MM/YYYY without timezone drift. */
function formatPrazo(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

/** Today's calendar date (YYYY-MM-DD) in America/Sao_Paulo. */
function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

/**
 * Dispatch a single deadline reminder per tarefa whose prazo is within reach
 * (today/overdue or tomorrow) and that still has an open responsável.
 *
 * Idempotency is enforced by an ATOMIC CLAIM identical in spirit to
 * `runReminderCheck`: the UPDATE stamps `lembrete_prazo_enviado_em` while it is
 * still NULL and returns only the rows it actually claimed, so concurrent
 * workers / overlapping ticks can never send the same reminder twice. A PATCH
 * that changes a tarefa's prazo resets this column, re-arming the reminder.
 *
 * "Due" means: status <> 'concluida', a responsável email is set, a prazo is
 * set, the reminder has not been sent, and prazo <= current_date + 1 (so both
 * overdue and due-tomorrow tarefas are caught). The job runs once daily so a
 * given tarefa is reminded a single time around its deadline.
 *
 * Delivery channels mirror the appointment reminder:
 *  - In-app notification (the bell) is the CANONICAL record, persisted
 *    regardless of channel preferences.
 *  - Web push + email are best-effort; their failures are swallowed so they can
 *    never resurface an already-delivered reminder.
 *
 * Fault tolerance: the claim stamps the row BEFORE dispatch, so a failure that
 * prevents us from even recording the in-app notification would otherwise drop
 * the reminder forever. To avoid that, when a row could not be recorded we
 * RELEASE the claim (`lembrete_prazo_enviado_em` back to NULL) for the next run.
 */
export async function runTarefaDeadlineCheck(): Promise<{
  claimed: number;
  emailsSent: number;
  pushSent: number;
  skipped: number;
  requeued: number;
}> {
  const claimed = await db
    .update(acaoTarefasTable)
    .set({ lembretePrazoEnviadoEm: new Date() })
    .where(
      sql`${acaoTarefasTable.status} <> 'concluida'
        AND ${acaoTarefasTable.responsavelEmail} IS NOT NULL
        AND ${acaoTarefasTable.prazo} IS NOT NULL
        AND ${acaoTarefasTable.prazo} <= current_date + 1
        AND ${acaoTarefasTable.lembretePrazoEnviadoEm} IS NULL`,
    )
    .returning();

  if (claimed.length === 0) {
    return { claimed: 0, emailsSent: 0, pushSent: 0, skipped: 0, requeued: 0 };
  }

  // Resolve action + clinic context for the claimed tarefas in a single query.
  const acaoIds = [...new Set(claimed.map((t) => t.acaoId))];
  const actionRows = await db
    .select({
      acaoId: actionsTable.id,
      acaoTitulo: actionsTable.titulo,
      clinicId: actionsTable.clinicId,
      clinicNome: clinicsTable.nome,
    })
    .from(actionsTable)
    .innerJoin(clinicsTable, eq(actionsTable.clinicId, clinicsTable.id))
    .where(inArray(actionsTable.id, acaoIds));
  const actionById = new Map(actionRows.map((a) => [a.acaoId, a]));

  const appUrl = await resolveAppUrl();
  const today = todayInSaoPaulo();
  let emailsSent = 0;
  let pushSent = 0;
  let skipped = 0;
  let requeued = 0;

  for (const tarefa of claimed) {
    let recorded = false;
    try {
      const action = actionById.get(tarefa.acaoId);
      const recipient = tarefa.responsavelEmail?.trim() || null;
      if (!action || !recipient || !tarefa.prazo) {
        skipped++;
        continue;
      }

      const clinicName = action.clinicNome ?? "Clínica";
      const prazoFmt = formatPrazo(tarefa.prazo);
      const vencidaHoje = tarefa.prazo <= today;
      const acaoPath = `/portal/clinica/${action.clinicId}/acao`;

      // Canonical in-app notification — persisted regardless of preferences.
      await db.insert(notificationsTable).values({
        clinicId: action.clinicId,
        tipo: "lembrete_tarefa",
        titulo: vencidaHoje
          ? `Tarefa vence hoje: ${tarefa.titulo}`
          : `Tarefa próxima do prazo: ${tarefa.titulo}`,
        mensagem: `Ação "${action.acaoTitulo}" — prazo ${prazoFmt}.`,
        acaoUrl: acaoPath,
      });
      recorded = true;

      // Web push — clinic-scoped resolution; best-effort.
      const pushRes = await sendPushToEmail(recipient, action.clinicId, {
        title: vencidaHoje
          ? `Tarefa vence hoje: ${tarefa.titulo}`
          : `Tarefa próxima do prazo: ${tarefa.titulo}`,
        body: `Ação: ${action.acaoTitulo} — prazo ${prazoFmt}.`,
        url: acaoPath,
        tag: `tarefa-deadline-${tarefa.id}`,
      }).catch(() => ({ sent: 0, failed: 0 }));
      pushSent += pushRes.sent;

      const prefs = await getRecipientPrefs(recipient, action.clinicId);
      if (prefs.emailEnabled) {
        const html = buildTarefaDeadlineEmail({
          clinicName,
          acaoTitulo: action.acaoTitulo,
          tarefaTitulo: tarefa.titulo,
          responsavelNome: tarefa.responsavelNome ?? recipient,
          prazo: tarefa.prazo,
          vencidaHoje,
          appUrl,
          acaoPath,
        });
        const ok = await sendEmail({
          to: recipient,
          subject: vencidaHoje
            ? `[IONEX360] Tarefa vence hoje: ${tarefa.titulo}`
            : `[IONEX360] Tarefa próxima do prazo: ${tarefa.titulo}`,
          html,
        }).catch(() => false);
        if (ok) emailsSent++;
      }
    } catch (err) {
      logger.error(
        { err, tarefaId: tarefa.id, acaoId: tarefa.acaoId },
        "Failed to dispatch tarefa deadline reminder",
      );
    } finally {
      if (!recorded) {
        await db
          .update(acaoTarefasTable)
          .set({ lembretePrazoEnviadoEm: null })
          .where(eq(acaoTarefasTable.id, tarefa.id))
          .catch((err) => {
            logger.error(
              { err, tarefaId: tarefa.id },
              "Failed to release tarefa deadline claim for retry",
            );
          });
        requeued++;
      }
    }
  }

  return { claimed: claimed.length, emailsSent, pushSent, skipped, requeued };
}
