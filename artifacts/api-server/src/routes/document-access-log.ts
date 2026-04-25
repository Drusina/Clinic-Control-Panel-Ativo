import { Router, type IRouter } from "express";
import { db, documentAccessLogTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/admin/document-access-log", async (req, res): Promise<void> => {
  const rawLimit = parseInt(String(req.query.limit ?? "50"), 10);
  const rawOffset = parseInt(String(req.query.offset ?? "0"), 10);
  const limit = Math.min(Math.max(isNaN(rawLimit) ? 50 : rawLimit, 1), 200);
  const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

  const rows = await db
    .select()
    .from(documentAccessLogTable)
    .orderBy(desc(documentAccessLogTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(rows);
});

export default router;
