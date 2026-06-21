import { describe, it, expect, afterAll } from "vitest";
import { db, clinicsTable, actionsTable, acaoTarefasTable } from "@workspace/db";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { seedIcsData } from "./ics-seed.js";

const suffix = randomUUID().slice(0, 8);
let clinicId: string;

afterAll(async () => {
  if (clinicId) await db.delete(clinicsTable).where(eq(clinicsTable.id, clinicId));
});

/** Count top-level (non-subtask) tarefas across every action of the clinic. */
async function countTopLevelTarefas(): Promise<number> {
  const acts = await db
    .select({ id: actionsTable.id })
    .from(actionsTable)
    .where(eq(actionsTable.clinicId, clinicId));
  const ids = acts.map((a) => a.id);
  if (ids.length === 0) return 0;
  const rows = await db
    .select({ id: acaoTarefasTable.id })
    .from(acaoTarefasTable)
    .where(
      and(inArray(acaoTarefasTable.acaoId, ids), isNull(acaoTarefasTable.parentTarefaId)),
    );
  return rows.length;
}

describe("seedIcsData — curated tarefas idempotency", () => {
  it("creates curated tarefas on first seed and never duplicates on re-run", async () => {
    const [clinic] = await db
      .insert(clinicsTable)
      .values({ nome: `Seed ${suffix}`, cnpj: `seed-${suffix}` })
      .returning();
    clinicId = clinic.id;

    const first = await seedIcsData(clinicId, null);
    expect(first.actions).toBeGreaterThan(0);
    expect(first.tarefas).toBeGreaterThan(0);

    const afterFirst = await countTopLevelTarefas();
    expect(afterFirst).toBe(first.tarefas);

    // Re-run with the same plan: nothing new is created (actions already exist
    // and already have top-level tarefas), so the totals stay put.
    const second = await seedIcsData(clinicId, null);
    expect(second.actions).toBe(0);
    expect(second.tarefas).toBe(0);

    const afterSecond = await countTopLevelTarefas();
    expect(afterSecond).toBe(afterFirst);
  });
});
