import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";

const router: IRouter = Router();

function mapNotification(n: typeof notificationsTable.$inferSelect) {
  return {
    id: n.id,
    clinicId: n.clinicId,
    tipo: n.tipo,
    titulo: n.titulo,
    mensagem: n.mensagem,
    lida: n.lida,
    acaoUrl: n.acaoUrl,
    createdAt: n.createdAt.toISOString(),
  };
}

router.get("/notifications", async (_req, res): Promise<void> => {
  const notifications = await db
    .select()
    .from(notificationsTable)
    .orderBy(notificationsTable.createdAt);

  res.json(notifications.reverse().map(mapNotification));
});

router.post("/notifications/:id/read", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [notification] = await db
    .update(notificationsTable)
    .set({ lida: true })
    .where(eq(notificationsTable.id, id))
    .returning();

  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  res.json(mapNotification(notification));
});

export default router;
