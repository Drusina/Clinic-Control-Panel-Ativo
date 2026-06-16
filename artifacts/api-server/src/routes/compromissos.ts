import { Router, type IRouter } from "express";
import { eq, and, gte, lte } from "drizzle-orm";
import { db, compromissosTable, actionsTable } from "@workspace/db";
import { isTrilhaEtapaKey } from "@workspace/trilha";
import { assertClinicAccess } from "../middleware/auth";
import {
  CreateCompromissoBody,
  UpdateCompromissoBody,
  ListCompromissosQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function mapCompromisso(c: typeof compromissosTable.$inferSelect) {
  return {
    id: c.id,
    clinicId: c.clinicId,
    tipo: c.tipo,
    titulo: c.titulo,
    descricao: c.descricao,
    inicio: c.inicio.toISOString(),
    fim: c.fim ? c.fim.toISOString() : null,
    diaInteiro: c.diaInteiro,
    responsavelNome: c.responsavelNome,
    responsavelEmail: c.responsavelEmail,
    local: c.local,
    status: c.status,
    etapaKey: c.etapaKey,
    acaoId: c.acaoId,
    lembreteMinutosAntes: c.lembreteMinutosAntes,
    lembreteEnviadoEm: c.lembreteEnviadoEm ? c.lembreteEnviadoEm.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : (value ?? "");
}

/**
 * Validate that an optional acaoId references an action belonging to the same
 * clinic. A bare FK is not enough — actions are clinic-scoped, so linking a
 * compromisso to another clinic's action would be a cross-clinic leak. Returns
 * an error message string when invalid, or null when ok.
 */
async function validateAcao(acaoId: string, clinicId: string): Promise<string | null> {
  const [acao] = await db
    .select({ clinicId: actionsTable.clinicId })
    .from(actionsTable)
    .where(eq(actionsTable.id, acaoId))
    .limit(1);
  if (!acao) return "Ação vinculada não encontrada.";
  if (acao.clinicId !== clinicId) return "Ação vinculada pertence a outra clínica.";
  return null;
}

router.get("/clinics/:clinicId/compromissos", async (req, res): Promise<void> => {
  const clinicId = param(req.params.clinicId);

  const parsed = ListCompromissosQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data;

  const conds = [eq(compromissosTable.clinicId, clinicId)];
  if (q.from) conds.push(gte(compromissosTable.inicio, new Date(q.from)));
  if (q.to) conds.push(lte(compromissosTable.inicio, new Date(q.to)));
  if (q.tipo) conds.push(eq(compromissosTable.tipo, q.tipo));
  if (q.status) conds.push(eq(compromissosTable.status, q.status));
  if (q.etapaKey) conds.push(eq(compromissosTable.etapaKey, q.etapaKey));
  if (q.acaoId) conds.push(eq(compromissosTable.acaoId, q.acaoId));

  const rows = await db
    .select()
    .from(compromissosTable)
    .where(and(...conds))
    .orderBy(compromissosTable.inicio);

  res.json(rows.map(mapCompromisso));
});

router.post("/clinics/:clinicId/compromissos", async (req, res): Promise<void> => {
  const clinicId = param(req.params.clinicId);
  const parsed = CreateCompromissoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;

  const inicio = new Date(d.inicio);
  if (Number.isNaN(inicio.getTime())) {
    res.status(400).json({ error: "Data de início inválida." });
    return;
  }
  let fim: Date | null = null;
  if (d.fim != null) {
    fim = new Date(d.fim);
    if (Number.isNaN(fim.getTime())) {
      res.status(400).json({ error: "Data de término inválida." });
      return;
    }
    if (fim.getTime() < inicio.getTime()) {
      res.status(400).json({ error: "O término não pode ser anterior ao início." });
      return;
    }
  }

  if (d.etapaKey != null && !isTrilhaEtapaKey(d.etapaKey)) {
    res.status(400).json({ error: "Etapa da trilha inválida." });
    return;
  }
  if (d.acaoId != null) {
    const acaoErr = await validateAcao(d.acaoId, clinicId);
    if (acaoErr) {
      res.status(400).json({ error: acaoErr });
      return;
    }
  }
  if (d.lembreteMinutosAntes != null && d.lembreteMinutosAntes < 0) {
    res.status(400).json({ error: "O lembrete deve ser um número de minutos não negativo." });
    return;
  }

  const [created] = await db
    .insert(compromissosTable)
    .values({
      clinicId,
      tipo: d.tipo ?? "reuniao",
      titulo: d.titulo,
      descricao: d.descricao ?? null,
      inicio,
      fim,
      diaInteiro: d.diaInteiro ?? false,
      responsavelNome: d.responsavelNome ?? null,
      responsavelEmail: d.responsavelEmail ?? null,
      local: d.local ?? null,
      status: d.status ?? "agendado",
      etapaKey: d.etapaKey ?? null,
      acaoId: d.acaoId ?? null,
      lembreteMinutosAntes: d.lembreteMinutosAntes ?? null,
    })
    .returning();

  res.status(201).json(mapCompromisso(created));
});

router.get("/compromissos/:id", async (req, res): Promise<void> => {
  const id = param(req.params.id);
  const [existing] = await db
    .select()
    .from(compromissosTable)
    .where(eq(compromissosTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Compromisso não encontrado." });
    return;
  }
  if (await assertClinicAccess(req, res, existing.clinicId)) return;
  res.json(mapCompromisso(existing));
});

router.patch("/compromissos/:id", async (req, res): Promise<void> => {
  const id = param(req.params.id);
  const parsed = UpdateCompromissoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(compromissosTable)
    .where(eq(compromissosTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Compromisso não encontrado." });
    return;
  }
  if (await assertClinicAccess(req, res, existing.clinicId)) return;

  const d = parsed.data;
  const updates: Partial<typeof compromissosTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  let nextInicio = existing.inicio;
  if (d.inicio != null) {
    const inicio = new Date(d.inicio);
    if (Number.isNaN(inicio.getTime())) {
      res.status(400).json({ error: "Data de início inválida." });
      return;
    }
    nextInicio = inicio;
    updates.inicio = inicio;
  }

  let nextFim: Date | null = existing.fim;
  if (d.fim !== undefined) {
    if (d.fim === null) {
      nextFim = null;
      updates.fim = null;
    } else {
      const fim = new Date(d.fim);
      if (Number.isNaN(fim.getTime())) {
        res.status(400).json({ error: "Data de término inválida." });
        return;
      }
      nextFim = fim;
      updates.fim = fim;
    }
  }

  // Validate the FINAL pair, not just an edited `fim`. This also rejects the
  // case where only `inicio` is moved past an existing (unchanged) `fim`.
  if (nextFim != null && nextFim.getTime() < nextInicio.getTime()) {
    res.status(400).json({ error: "O término não pode ser anterior ao início." });
    return;
  }

  if (d.tipo != null) updates.tipo = d.tipo;
  if (d.titulo != null) updates.titulo = d.titulo;
  if (d.descricao !== undefined) updates.descricao = d.descricao;
  if (d.diaInteiro != null) updates.diaInteiro = d.diaInteiro;
  if (d.responsavelNome !== undefined) updates.responsavelNome = d.responsavelNome;
  if (d.responsavelEmail !== undefined) updates.responsavelEmail = d.responsavelEmail;
  if (d.local !== undefined) updates.local = d.local;
  if (d.status != null) updates.status = d.status;

  if (d.etapaKey !== undefined) {
    if (d.etapaKey != null && !isTrilhaEtapaKey(d.etapaKey)) {
      res.status(400).json({ error: "Etapa da trilha inválida." });
      return;
    }
    updates.etapaKey = d.etapaKey;
  }

  if (d.acaoId !== undefined) {
    if (d.acaoId != null) {
      const acaoErr = await validateAcao(d.acaoId, existing.clinicId);
      if (acaoErr) {
        res.status(400).json({ error: acaoErr });
        return;
      }
    }
    updates.acaoId = d.acaoId;
  }

  if (d.lembreteMinutosAntes !== undefined) {
    if (d.lembreteMinutosAntes != null && d.lembreteMinutosAntes < 0) {
      res.status(400).json({ error: "O lembrete deve ser um número de minutos não negativo." });
      return;
    }
    updates.lembreteMinutosAntes = d.lembreteMinutosAntes;
  }

  // Re-arm the reminder when the timing, the offset, or the status materially
  // changes and the appointment is still scheduled — so an edited appointment
  // can fire its reminder again instead of being suppressed by a stale stamp.
  const inicioChanged = d.inicio != null && nextInicio.getTime() !== existing.inicio.getTime();
  const offsetChanged =
    d.lembreteMinutosAntes !== undefined &&
    (d.lembreteMinutosAntes ?? null) !== existing.lembreteMinutosAntes;
  const statusChanged = d.status != null && d.status !== existing.status;
  const finalStatus = d.status ?? existing.status;
  if ((inicioChanged || offsetChanged || statusChanged) && finalStatus === "agendado") {
    updates.lembreteEnviadoEm = null;
  }

  const [updated] = await db
    .update(compromissosTable)
    .set(updates)
    .where(eq(compromissosTable.id, id))
    .returning();

  res.json(mapCompromisso(updated));
});

router.delete("/compromissos/:id", async (req, res): Promise<void> => {
  const id = param(req.params.id);
  const [existing] = await db
    .select({ clinicId: compromissosTable.clinicId })
    .from(compromissosTable)
    .where(eq(compromissosTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Compromisso não encontrado." });
    return;
  }
  if (await assertClinicAccess(req, res, existing.clinicId)) return;

  await db.delete(compromissosTable).where(eq(compromissosTable.id, id));
  res.sendStatus(204);
});

export default router;
