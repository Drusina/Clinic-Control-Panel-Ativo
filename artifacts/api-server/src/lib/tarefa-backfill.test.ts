import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";

import {
  db,
  clinicsTable,
  actionsTable,
  acaoChecklistItensTable,
  acaoTarefasTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { backfillAcaoChecklistToTarefas } from "./tarefa-backfill.js";

const suffix = randomUUID().slice(0, 8);
let clinicId: string;
let acaoId: string;

beforeAll(async () => {
  const [c] = await db
    .insert(clinicsTable)
    .values({ nome: `Backfill ${suffix}`, cnpj: `bf-${suffix}` })
    .returning();
  clinicId = c.id;

  const [a] = await db
    .insert(actionsTable)
    .values({ clinicId, titulo: `Ação backfill ${suffix}` })
    .returning();
  acaoId = a.id;

  // Two checklist items: one done, one pending — ordem preserved.
  await db.insert(acaoChecklistItensTable).values([
    { acaoId, texto: "Item feito", feito: true, ordem: 0 },
    { acaoId, texto: "Item pendente", feito: false, ordem: 1 },
  ]);
});

afterAll(async () => {
  await db.delete(acaoTarefasTable).where(eq(acaoTarefasTable.acaoId, acaoId));
  await db
    .delete(acaoChecklistItensTable)
    .where(eq(acaoChecklistItensTable.acaoId, acaoId));
  await db.delete(actionsTable).where(eq(actionsTable.clinicId, clinicId));
  await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicId));
});

describe("backfillAcaoChecklistToTarefas", () => {
  it("migrates each checklist item into one tarefa and is idempotent", async () => {
    const inserted = await backfillAcaoChecklistToTarefas();
    expect(inserted).toBeGreaterThanOrEqual(2);

    const tarefas = await db
      .select()
      .from(acaoTarefasTable)
      .where(eq(acaoTarefasTable.acaoId, acaoId));
    expect(tarefas).toHaveLength(2);

    const feito = tarefas.find((t) => t.titulo === "Item feito");
    const pendente = tarefas.find((t) => t.titulo === "Item pendente");

    // Title/status/ordem mapped; completed item carries concluidaEm.
    expect(feito?.status).toBe("concluida");
    expect(feito?.ordem).toBe(0);
    expect(feito?.concluidaEm).not.toBeNull();
    expect(feito?.origemChecklistId).not.toBeNull();

    expect(pendente?.status).toBe("a_fazer");
    expect(pendente?.ordem).toBe(1);
    expect(pendente?.concluidaEm).toBeNull();

    // Original checklist rows are never deleted — migration is additive.
    const checklist = await db
      .select()
      .from(acaoChecklistItensTable)
      .where(eq(acaoChecklistItensTable.acaoId, acaoId));
    expect(checklist).toHaveLength(2);

    // Re-running produces no new rows (idempotent via origem_checklist_id).
    const second = await backfillAcaoChecklistToTarefas();
    expect(second).toBe(0);
    const after = await db
      .select()
      .from(acaoTarefasTable)
      .where(eq(acaoTarefasTable.acaoId, acaoId));
    expect(after).toHaveLength(2);
  });
});
