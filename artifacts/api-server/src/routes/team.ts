import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, teamTable } from "@workspace/db";
import { CreateTeamMemberBody, UpdateTeamMemberBody, UpdateTeamMemberResponse } from "@workspace/api-zod";
import { signInviteToken } from "../middleware/auth";
import { sendEmail, buildInviteEmail, buildPushSetupEmail } from "../lib/email.js";

const router: IRouter = Router();

function mapTeamMember(t: typeof teamTable.$inferSelect) {
  return {
    id: t.id,
    clinicId: t.clinicId,
    nome: t.nome,
    funcao: t.funcao,
    area: t.area,
    vinculo: t.vinculo,
    email: t.email,
    whatsapp: t.whatsapp,
    temAcessoPlataforma: t.temAcessoPlataforma ?? false,
    inviteStatus: t.inviteStatus ?? null,
    lastAccessAt: t.lastAccessAt ? t.lastAccessAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  };
}

async function dispatchSupabaseInvite(email: string): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return false;

  const res = await fetch(`${supabaseUrl}/auth/v1/invite`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  return res.ok;
}

export async function sendPushSetupEmail(member: typeof teamTable.$inferSelect): Promise<void> {
  if (!member.email) return;
  const appUrl = process.env.APP_URL ?? "https://ionex360.com.br";
  let inviteToken: string;
  try {
    inviteToken = signInviteToken(member.id);
  } catch {
    return;
  }
  const activationLink = `${appUrl}/convite?ref=${encodeURIComponent(member.id)}&tok=${encodeURIComponent(inviteToken)}`;

  await sendEmail({
    to: member.email,
    subject: `[IONEX360] Ative suas notificações push`,
    html: buildPushSetupEmail({ nome: member.nome ?? "Usuário", activationLink }),
  });
}

async function dispatchPlatformInvite(member: typeof teamTable.$inferSelect): Promise<string> {
  if (!member.email) return "no_email";

  const supabaseInvited = await dispatchSupabaseInvite(member.email);

  if (supabaseInvited) {
    sendPushSetupEmail(member).catch(() => {});
    return "sent";
  }

  const appUrl = process.env.APP_URL ?? "https://ionex360.com.br";
  let inviteToken: string;
  try {
    inviteToken = signInviteToken(member.id);
  } catch {
    return "pending";
  }
  const inviteLink = `${appUrl}/convite?ref=${encodeURIComponent(member.id)}&tok=${encodeURIComponent(inviteToken)}`;

  const sent = await sendEmail({
    to: member.email,
    subject: `Você foi convidado para a plataforma IONEX360`,
    html: buildInviteEmail({
      email: member.email,
      role: member.funcao ?? "colaborador",
      magicLink: inviteLink,
    }),
  });

  return sent ? "sent" : "pending";
}

router.get("/team/all", async (_req, res): Promise<void> => {
  const members = await db
    .select()
    .from(teamTable)
    .orderBy(teamTable.nome);
  res.json(
    members.map((m) => ({
      ...mapTeamMember(m),
      notificationPreferences: m.notificationPreferences ?? { emailEnabled: true, whatsappEnabled: true },
    }))
  );
});

router.get("/clinics/:clinicId/team", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const members = await db.select().from(teamTable).where(eq(teamTable.clinicId, clinicId));
  res.json(members.map(mapTeamMember));
});

router.post("/clinics/:clinicId/team", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const parsed = CreateTeamMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [member] = await db
    .insert(teamTable)
    .values({
      clinicId,
      nome: parsed.data.nome,
      funcao: parsed.data.funcao ?? null,
      area: parsed.data.area ?? null,
      vinculo: parsed.data.vinculo ?? null,
      email: parsed.data.email ?? null,
      whatsapp: parsed.data.whatsapp ?? null,
      temAcessoPlataforma: parsed.data.temAcessoPlataforma ?? false,
    })
    .returning();

  if (parsed.data.temAcessoPlataforma && parsed.data.email) {
    try {
      const status = await dispatchPlatformInvite(member);
      await db.update(teamTable).set({ inviteStatus: status }).where(eq(teamTable.id, member.id));
      member.inviteStatus = status;
    } catch {
      member.inviteStatus = "error";
    }
  }

  res.status(201).json(mapTeamMember(member));
});

router.patch("/team/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateTeamMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(teamTable).where(eq(teamTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Team member not found" });
    return;
  }

  const updates: Partial<typeof teamTable.$inferInsert> = {};
  const d = parsed.data;
  if (d.nome != null) updates.nome = d.nome;
  if (d.funcao !== undefined) updates.funcao = d.funcao;
  if (d.area !== undefined) updates.area = d.area;
  if (d.vinculo !== undefined) updates.vinculo = d.vinculo;
  if (d.email !== undefined) updates.email = d.email;
  if (d.whatsapp !== undefined) updates.whatsapp = d.whatsapp;

  const enablingAccess = d.temAcessoPlataforma === true && !existing.temAcessoPlataforma;
  if (d.temAcessoPlataforma != null) updates.temAcessoPlataforma = d.temAcessoPlataforma;

  if (enablingAccess) {
    const emailToUse = d.email ?? existing.email;
    if (emailToUse) {
      try {
        const memberForInvite = { ...existing, ...updates, email: emailToUse } as typeof teamTable.$inferSelect;
        const status = await dispatchPlatformInvite(memberForInvite);
        updates.inviteStatus = status;
      } catch {
        updates.inviteStatus = "error";
      }
    } else {
      updates.inviteStatus = "no_email";
    }
  } else if (d.temAcessoPlataforma === false && existing.temAcessoPlataforma) {
    updates.inviteStatus = null;
  }

  const [member] = await db.update(teamTable).set(updates).where(eq(teamTable.id, id)).returning();
  if (!member) {
    res.status(404).json({ error: "Team member not found" });
    return;
  }

  res.json(UpdateTeamMemberResponse.parse(mapTeamMember(member)));
});

router.delete("/team/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [member] = await db.delete(teamTable).where(eq(teamTable.id, id)).returning();
  if (!member) {
    res.status(404).json({ error: "Team member not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
