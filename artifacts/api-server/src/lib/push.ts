import webpush from "web-push";
import { db, pushSubscriptionsTable, serverConfigTable } from "@workspace/db";
import { eq, or, isNull, sql, and } from "drizzle-orm";

const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:noreply@clinionex.com.br";

let vapidPublicKey: string | null = null;
let vapidConfigured = false;

export async function initVapid(): Promise<void> {
  try {
    const [pubRow, privRow] = await Promise.all([
      db.select().from(serverConfigTable).where(eq(serverConfigTable.key, "vapid_public_key")).limit(1),
      db.select().from(serverConfigTable).where(eq(serverConfigTable.key, "vapid_private_key")).limit(1),
    ]);

    let publicKey = pubRow[0]?.value ?? null;
    let privateKey = privRow[0]?.value ?? null;

    if (!publicKey || !privateKey) {
      const keys = webpush.generateVAPIDKeys();
      publicKey = keys.publicKey;
      privateKey = keys.privateKey;

      await db
        .insert(serverConfigTable)
        .values([
          { key: "vapid_public_key", value: publicKey },
          { key: "vapid_private_key", value: privateKey },
        ])
        .onConflictDoUpdate({
          target: serverConfigTable.key,
          set: { value: sql`excluded.value`, updatedAt: new Date() },
        });
    }

    webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
    vapidPublicKey = publicKey;
    vapidConfigured = true;
  } catch (err) {
    console.error("Failed to initialize VAPID keys:", err);
  }
}

export function isPushConfigured(): boolean {
  return vapidConfigured;
}

export function getVapidPublicKey(): string | null {
  return vapidPublicKey;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

async function dispatchPush(
  subs: { id: string; subscription: unknown }[],
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const row of subs) {
    const sub = row.subscription as webpush.PushSubscription;
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      sent++;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, row.id));
      }
      failed++;
    }
  }

  return { sent, failed };
}

export async function sendPushToEmail(email: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!vapidConfigured) return { sent: 0, failed: 0 };

  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.email, email));

  return dispatchPush(subs, payload);
}

export async function sendPushToClinic(clinicId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!vapidConfigured) return { sent: 0, failed: 0 };

  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(
      and(
        isNull(pushSubscriptionsTable.teamMemberId),
        or(
          eq(pushSubscriptionsTable.clinicId, clinicId),
          isNull(pushSubscriptionsTable.clinicId)
        )
      )
    );

  const seen = new Set<string>();
  const unique = subs.filter((row) => {
    const ep = (row.subscription as { endpoint: string }).endpoint;
    if (seen.has(ep)) return false;
    seen.add(ep);
    return true;
  });

  return dispatchPush(unique, payload);
}
