import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, processosTable } from "@workspace/db";

const router: IRouter = Router();

function mapProcesso(p: typeof processosTable.$inferSelect) {
  return {
    id: p.id,
    clinicId: p.clinicId,
    nome: p.nome,
    descricao: p.descricao,
    status: p.status,
    responsavel: p.responsavel,
    duracaoMedia: p.duracaoMedia,
    gargalos: p.gargalos,
    pilarSlug: p.pilarSlug,
    flowNodes: p.flowNodes,
    flowEdges: p.flowEdges,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

router.get("/clinics/:clinicId/processos", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const rows = await db.select().from(processosTable).where(eq(processosTable.clinicId, clinicId)).orderBy(processosTable.createdAt);
  res.json(rows.map(mapProcesso));
});

router.post("/clinics/:clinicId/processos", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const d = req.body;
  if (!d.nome) {
    res.status(400).json({ error: "nome is required" });
    return;
  }
  const [row] = await db
    .insert(processosTable)
    .values({
      clinicId,
      nome: d.nome,
      descricao: d.descricao ?? null,
      status: d.status ?? "pendente",
      responsavel: d.responsavel ?? null,
      duracaoMedia: d.duracaoMedia ?? null,
      gargalos: d.gargalos ?? null,
      pilarSlug: d.pilarSlug ?? null,
      flowNodes: d.flowNodes ?? null,
      flowEdges: d.flowEdges ?? null,
    })
    .returning();
  res.status(201).json(mapProcesso(row));
});

router.patch("/processos/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const d = req.body;
  const updates: Partial<typeof processosTable.$inferInsert> = { updatedAt: new Date() };
  if (d.nome !== undefined) updates.nome = d.nome;
  if (d.descricao !== undefined) updates.descricao = d.descricao;
  if (d.status !== undefined) updates.status = d.status;
  if (d.responsavel !== undefined) updates.responsavel = d.responsavel;
  if (d.duracaoMedia !== undefined) updates.duracaoMedia = d.duracaoMedia;
  if (d.gargalos !== undefined) updates.gargalos = d.gargalos;
  if (d.pilarSlug !== undefined) updates.pilarSlug = d.pilarSlug;
  if (d.flowNodes !== undefined) updates.flowNodes = d.flowNodes;
  if (d.flowEdges !== undefined) updates.flowEdges = d.flowEdges;
  const [row] = await db.update(processosTable).set(updates).where(eq(processosTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(mapProcesso(row));
});

router.delete("/processos/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [row] = await db.delete(processosTable).where(eq(processosTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

export default router;
