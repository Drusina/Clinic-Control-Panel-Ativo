import { Router, type IRouter } from "express";
import { db, teamTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireSuperAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

router.get("/preferences/notifications/:memberId", requireSuperAdmin, async (req, res): Promise<void> => {
  const { memberId } = req.params;
  const [member] = await db
    .select({ notificationPreferences: teamTable.notificationPreferences })
    .from(teamTable)
    .where(eq(teamTable.id, memberId))
    .limit(1);

  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  res.json({
    emailEnabled: member.notificationPreferences?.emailEnabled ?? true,
    whatsappEnabled: member.notificationPreferences?.whatsappEnabled ?? true,
  });
});

router.patch("/preferences/notifications/:memberId", requireSuperAdmin, async (req, res): Promise<void> => {
  const { memberId } = req.params;
  const parsed = z
    .object({
      emailEnabled: z.boolean().optional(),
      whatsappEnabled: z.boolean().optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [member] = await db
    .select({ notificationPreferences: teamTable.notificationPreferences })
    .from(teamTable)
    .where(eq(teamTable.id, memberId))
    .limit(1);

  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  const current = member.notificationPreferences ?? {};
  const updated = {
    emailEnabled: parsed.data.emailEnabled ?? current.emailEnabled ?? true,
    whatsappEnabled: parsed.data.whatsappEnabled ?? current.whatsappEnabled ?? true,
  };

  await db
    .update(teamTable)
    .set({ notificationPreferences: updated })
    .where(eq(teamTable.id, memberId));

  res.json(updated);
});

export default router;
