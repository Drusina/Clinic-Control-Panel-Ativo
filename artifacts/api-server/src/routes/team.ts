import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, teamTable } from "@workspace/db";
import { CreateTeamMemberBody, UpdateTeamMemberBody, UpdateTeamMemberResponse } from "@workspace/api-zod";

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

  res.status(201).json(mapTeamMember(member));
});

router.patch("/team/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateTeamMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
  if (d.temAcessoPlataforma != null) updates.temAcessoPlataforma = d.temAcessoPlataforma;

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
