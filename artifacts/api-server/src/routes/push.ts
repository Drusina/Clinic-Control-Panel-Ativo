import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { getVapidPublicKey, isPushConfigured } from "../lib/push.js";
import { requireAuth } from "../middleware/auth.js";
import { clinicsTable, teamTable } from "@workspace/db/schema";
import { sendPushSetupEmail } from "./team.js";

const router: IRouter = Router();

type AuthedRequest = Request & { user: Record<string, unknown> };

async function requireActiveTeamMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authedReq = req as AuthedRequest;
  const role = String(authedReq.user?.role ?? "");
  if (role !== "team_member") {
    next();
    return;
  }
  const teamMemberId = authedReq.user?.teamMemberId as string | null | undefined;
  if (!teamMemberId) {
    res.status(403).json({ error: "Token de membro inválido" });
    return;
  }
  const [member] = await db
    .select({ id: teamTable.id, temAcessoPlataforma: teamTable.temAcessoPlataforma })
    .from(teamTable)
    .where(eq(teamTable.id, teamMemberId))
    .limit(1);
  if (!member || !member.temAcessoPlataforma) {
    res.status(403).json({ error: "Acesso revogado. Solicite um novo convite ao responsável da sua clínica." });
    return;
  }
  next();
}

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

router.get("/push/vapid-public-key", requireAuth, requireActiveTeamMember, (_req, res): void => {
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({ error: "Push not configured" });
    return;
  }
  res.json({ publicKey: key });
});

router.post("/push/subscribe", requireAuth, requireActiveTeamMember, async (req, res): Promise<void> => {
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

  if (userRole === "team_member" && !teamMemberId) {
    res.status(403).json({ error: "Membro de equipe não encontrado" });
    return;
  }

  await db.delete(pushSubscriptionsTable).where(
    sql`${pushSubscriptionsTable.subscription}->>'endpoint' = ${subscription.endpoint}`
  );

  await db.insert(pushSubscriptionsTable).values({
    email: userKey,
    clinicId: effectiveClinicId,
    teamMemberId,
    subscription,
  });

  res.status(201).json({ ok: true, created: true });
});

router.delete("/push/subscribe", requireAuth, requireActiveTeamMember, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const userKey = String(authedReq.user.sub ?? "unknown");
  const userRole = String(authedReq.user.role ?? "");
  const teamMemberId = authedReq.user.teamMemberId as string | null | undefined;
  const { endpoint } = req.body as { endpoint?: string };

  if (!endpoint) {
    res.status(400).json({ error: "endpoint required" });
    return;
  }

  const allForUser = teamMemberId
    ? await db.select().from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.teamMemberId, teamMemberId))
    : await db.select().from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.email, userKey));

  for (const row of allForUser) {
    if ((row.subscription as { endpoint: string }).endpoint === endpoint) {
      const whereClause = teamMemberId && userRole === "team_member"
        ? and(eq(pushSubscriptionsTable.id, row.id), eq(pushSubscriptionsTable.teamMemberId, teamMemberId))
        : and(eq(pushSubscriptionsTable.id, row.id), eq(pushSubscriptionsTable.email, userKey));
      await db.delete(pushSubscriptionsTable).where(whereClause);
    }
  }

  res.json({ ok: true });
});

router.post("/push/resend-setup-email", requireAuth, requireActiveTeamMember, async (req, res): Promise<void> => {
  const authedReq = req as AuthedRequest;
  const teamMemberId = authedReq.user.teamMemberId as string | undefined;

  if (!teamMemberId) {
    res.status(403).json({ error: "Este recurso é exclusivo para membros de equipe" });
    return;
  }

  const [member] = await db
    .select()
    .from(teamTable)
    .where(eq(teamTable.id, teamMemberId))
    .limit(1);

  if (!member) {
    res.status(404).json({ error: "Membro não encontrado" });
    return;
  }

  if (!member.email) {
    res.status(400).json({ error: "Este membro não possui e-mail cadastrado" });
    return;
  }

  try {
    await sendPushSetupEmail(member, req);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Falha ao enviar o e-mail. Tente novamente mais tarde." });
  }
});

export default router;
