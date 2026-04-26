import { Router, type IRouter } from "express";
import { eq, and, asc, max, sql } from "drizzle-orm";
import { db, documentCategoriesTable, clinicDocumentsTable, clinicsTable } from "@workspace/db";

const router: IRouter = Router();

const DEFAULT_CATEGORIES = [
  "Contratos e Aditivos",
  "Licenças e Autorizações",
  "Documentos Contábeis e Fiscais",
  "Recursos Humanos",
  "Equipamentos e Manutenções",
  "Atas e Comunicações",
];

interface CategoryWithCount {
  id: string;
  clinicId: string;
  name: string;
  ordem: number;
  createdAt: string;
  documentCount: number;
}

function mapCategory(
  c: typeof documentCategoriesTable.$inferSelect,
  count = 0,
): CategoryWithCount {
  return {
    id: c.id,
    clinicId: c.clinicId,
    name: c.name,
    ordem: c.ordem,
    createdAt: c.createdAt.toISOString(),
    documentCount: count,
  };
}

type SeedResult = { ok: true } | { error: "not_found" };

async function seedDefaultCategories(clinicId: string): Promise<SeedResult> {
  return await db.transaction(async (tx) => {
    // Lock the clinic row to serialize concurrent first-access seeders for the
    // same clinic, and to validate that the clinic exists (avoiding a later
    // FK error and giving the caller a clean 404).
    const clinicRows = await tx.execute(
      sql`SELECT id FROM ${clinicsTable} WHERE ${clinicsTable.id} = ${clinicId} FOR UPDATE`,
    );
    if (clinicRows.rows.length === 0) {
      return { error: "not_found" as const };
    }

    const existing = await tx
      .select({ id: documentCategoriesTable.id })
      .from(documentCategoriesTable)
      .where(eq(documentCategoriesTable.clinicId, clinicId))
      .limit(1);

    if (existing.length > 0) return { ok: true as const };

    await tx.insert(documentCategoriesTable).values(
      DEFAULT_CATEGORIES.map((name, i) => ({
        clinicId,
        name,
        ordem: i,
      })),
    );

    return { ok: true as const };
  });
}

router.get("/clinics/:clinicId/document-categories", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const seed = await seedDefaultCategories(clinicId);
  if ("error" in seed) {
    res.status(404).json({ error: "Clínica não encontrada" });
    return;
  }

  const cats = await db
    .select()
    .from(documentCategoriesTable)
    .where(eq(documentCategoriesTable.clinicId, clinicId))
    .orderBy(asc(documentCategoriesTable.ordem), asc(documentCategoriesTable.createdAt));

  // Count documents per category in one query
  const counts = await db
    .select({
      categoryId: clinicDocumentsTable.categoryId,
      n: clinicDocumentsTable.id,
    })
    .from(clinicDocumentsTable)
    .where(eq(clinicDocumentsTable.clinicId, clinicId));

  const countByCat = new Map<string, number>();
  for (const row of counts) {
    countByCat.set(row.categoryId, (countByCat.get(row.categoryId) ?? 0) + 1);
  }

  res.json(cats.map((c) => mapCategory(c, countByCat.get(c.id) ?? 0)));
});

router.post("/clinics/:clinicId/document-categories", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

  if (!name) {
    res.status(400).json({ error: "name é obrigatório" });
    return;
  }
  if (name.length > 120) {
    res.status(400).json({ error: "name muito longo (máx 120 caracteres)" });
    return;
  }

  const [{ maxOrdem }] = await db
    .select({ maxOrdem: max(documentCategoriesTable.ordem) })
    .from(documentCategoriesTable)
    .where(eq(documentCategoriesTable.clinicId, clinicId));

  const nextOrdem = (maxOrdem ?? -1) + 1;

  const [cat] = await db
    .insert(documentCategoriesTable)
    .values({ clinicId, name, ordem: nextOrdem })
    .returning();

  res.status(201).json(mapCategory(cat, 0));
});

router.patch("/clinics/:clinicId/document-categories/:id", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

  if (!name) {
    res.status(400).json({ error: "name é obrigatório" });
    return;
  }
  if (name.length > 120) {
    res.status(400).json({ error: "name muito longo (máx 120 caracteres)" });
    return;
  }

  const [updated] = await db
    .update(documentCategoriesTable)
    .set({ name })
    .where(
      and(
        eq(documentCategoriesTable.id, id),
        eq(documentCategoriesTable.clinicId, clinicId),
      ),
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Categoria não encontrada" });
    return;
  }

  // Get count for response
  const docs = await db
    .select({ id: clinicDocumentsTable.id })
    .from(clinicDocumentsTable)
    .where(eq(clinicDocumentsTable.categoryId, id));

  res.json(mapCategory(updated, docs.length));
});

router.delete("/clinics/:clinicId/document-categories/:id", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const docs = await db
    .select({ id: clinicDocumentsTable.id })
    .from(clinicDocumentsTable)
    .where(eq(clinicDocumentsTable.categoryId, id))
    .limit(1);

  if (docs.length > 0) {
    res.status(400).json({
      error: "Categoria possui documentos. Mova ou exclua os documentos antes de remover a categoria.",
    });
    return;
  }

  const deleted = await db
    .delete(documentCategoriesTable)
    .where(
      and(
        eq(documentCategoriesTable.id, id),
        eq(documentCategoriesTable.clinicId, clinicId),
      ),
    )
    .returning({ id: documentCategoriesTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Categoria não encontrada" });
    return;
  }

  res.json({ success: true });
});

export default router;
