import { db, documentosTable, clinicsTable } from "@workspace/db";
import { lte, gte, and, ne, isNotNull, inArray } from "drizzle-orm";
import { sendEmail, buildExpiryDigestEmail } from "./email.js";
import { getRecipientPrefs } from "./preferences.js";
import { sendPushToClinic } from "./push.js";

export async function runExpiryCheck(): Promise<{ sent: number; skipped: number; total: number }> {
  const now = new Date();
  const in30Days = new Date(now);
  in30Days.setDate(in30Days.getDate() + 30);

  const nowStr = now.toISOString().slice(0, 10);
  const in30DaysStr = in30Days.toISOString().slice(0, 10);

  const expiringDocs = await db
    .select({
      id: documentosTable.id,
      clinicId: documentosTable.clinicId,
      nome: documentosTable.nome,
      categoria: documentosTable.categoria,
      validade: documentosTable.validade,
    })
    .from(documentosTable)
    .where(
      and(
        isNotNull(documentosTable.validade),
        gte(documentosTable.validade, nowStr),
        lte(documentosTable.validade, in30DaysStr),
        ne(documentosTable.status, "arquivado")
      )
    );

  if (expiringDocs.length === 0) return { sent: 0, skipped: 0, total: 0 };

  const byClinic = new Map<string, typeof expiringDocs>();
  for (const doc of expiringDocs) {
    const list = byClinic.get(doc.clinicId) ?? [];
    list.push(doc);
    byClinic.set(doc.clinicId, list);
  }

  const clinicIds = Array.from(byClinic.keys());
  const clinics = await db
    .select({ id: clinicsTable.id, nome: clinicsTable.nome, email: clinicsTable.email })
    .from(clinicsTable)
    .where(inArray(clinicsTable.id, clinicIds));

  let sent = 0;
  let skipped = 0;

  for (const clinic of clinics) {
    const docs = byClinic.get(clinic.id) ?? [];
    if (docs.length === 0) continue;

    const docItems = docs.map((d) => {
      const validadeDate = new Date((d.validade ?? "") + "T00:00:00");
      const diff = Math.ceil((validadeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return {
        nome: d.nome,
        categoria: d.categoria,
        validade: d.validade ?? "",
        diasRestantes: Math.max(diff, 0),
      };
    });

    sendPushToClinic(clinic.id, {
      title: "Documentos próximos ao vencimento",
      body: `${clinic.nome}: ${docs.length} documento(s) vencem em até 30 dias.`,
      url: "/documentos",
      tag: `expiry-${clinic.id}`,
    }).catch(() => {});

    if (!clinic.email) {
      skipped++;
      continue;
    }

    const recipientPrefs = await getRecipientPrefs(clinic.email);
    if (!recipientPrefs.emailEnabled) {
      skipped++;
      continue;
    }

    const html = buildExpiryDigestEmail({
      clinicName: clinic.nome,
      adminEmail: clinic.email,
      documents: docItems,
    });

    const ok = await sendEmail({
      to: clinic.email,
      subject: `[IONEX360] ${docs.length} documento(s) próximos ao vencimento — ${clinic.nome}`,
      html,
    });
    if (ok) sent++;

  }

  return { sent, skipped, total: clinics.length };
}
