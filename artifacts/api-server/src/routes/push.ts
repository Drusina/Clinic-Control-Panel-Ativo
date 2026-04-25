import { Router, type IRouter, type Request } from "express";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getVapidPublicKey, isPushConfigured } from "../lib/push.js";
import { requireAuth } from "../middleware/auth.js";
import { clinicsTable, teamTable } from "@workspace/db/schema";

const router: IRouter = Router();

type AuthedRequest = Request & { user: Record<string, unknown> };

const SubscribeBody = z.object({
  clinicId: z.string().uuid().optional(),
  subscription: z.object({
    endpoint: z.string().url(),
    expirationTime: z.number().nullable(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
  }),
});

router.get("/push/vapid-public-key", requireAuth, (_req, res): void => {
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({ error: "Push not configured" });
    return;
  }
  res.json({ publicKey: key });
});

router.post("/push/subscribe", requireAuth, async (req, res): Promise<void> => {
  if (!isPushConfigured()) {
    res.status(503).json({ error: "Push not configured" });
    return;
  }

  const authedReq = req as AuthedRequest;
  const userKey = String(authedReq.user.sub ?? "unknown");
  const userRole = String(authedReq.user.role ?? "");

  const parsed = SubscribeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { clinicId: requestedClinicId, subscription } = parsed.data;

  let effectiveClinicId: string | null = null;

  if (userRole === "team_member") {
    effectiveClinicId = null;
  } else if (userKey === "super_admin") {
    if (requestedClinicId) {
      const clinic = await db
        .select({ id: clinicsTable.id })
        .from(clinicsTable)
        .where(eq(clinicsTable.id, requestedClinicId))
        .limit(1);
      if (clinic.length === 0) {
        res.status(404).json({ error: "Clinic not found" });
        return;
      }
      effectiveClinicId = requestedClinicId;
    }
  } else if (requestedClinicId) {
    res.status(403).json({ error: "Clinic-scoped subscriptions require super admin or team member access" });
    return;
  }

  let teamMemberId: string | null = null;
  if (userRole === "team_member") {
    const tokenTeamMemberId = authedReq.user.teamMemberId as string | null | undefined;
    if (tokenTeamMemberId) {
      const [found] = await db
        .select({ id: teamTable.id })
        .from(teamTable)
        .where(eq(teamTable.id, tokenTeamMemberId))
        .limit(1);
      teamMemberId = found?.id ?? null;
    }
  } else {
    const teamMember = await db
      .select({ id: teamTable.id })
      .from(teamTable)
      .where(eq(teamTable.email, userKey))
      .limit(1);
    teamMemberId = teamMember[0]?.id ?? null;
  }

  const existingForUser = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.email, userKey));

  const alreadyExists = existingForUser.some(
    (row) => (row.subscription as { endpoint: string }).endpoint === subscription.endpoint
  );

  if (alreadyExists) {
    res.json({ ok: true, created: false });
    return;
  }

  await db.insert(pushSubscriptionsTable).values({
    email: userKey,
    clinicId: effectiveClinicId,
    teamMemberId,
    subscription,
  });

  res.status(201).json({ ok: true, created: true });
});

router.delete("/push/subscribe", requireAuth, async (req, res): Promise<void> => {
  const userKey = String((req as AuthedRequest).user.sub ?? "unknown");
  const { endpoint } = req.body as { endpoint?: string };

  if (!endpoint) {
    res.status(400).json({ error: "endpoint required" });
    return;
  }

  const allForUser = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.email, userKey));

  for (const row of allForUser) {
    if ((row.subscription as { endpoint: string }).endpoint === endpoint) {
      await db.delete(pushSubscriptionsTable).where(
        and(
          eq(pushSubscriptionsTable.id, row.id),
          eq(pushSubscriptionsTable.email, userKey)
        )
      );
    }
  }

  res.json({ ok: true });
});

export default router;
