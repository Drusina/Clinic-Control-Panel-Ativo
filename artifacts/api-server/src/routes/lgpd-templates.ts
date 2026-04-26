import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, lgpdTermoTemplatesTable } from "@workspace/db";
import { DEFAULT_TEMPLATES, TEMPLATE_SLUGS } from "../lib/lgpd-templates.js";
import { renderTermoPdf, type ContratadaInfo, type ContratanteInfo } from "../lib/lgpd-pdf.js";
import { getConfig } from "../lib/config.js";

const router: IRouter = Router();

async function ensureSeeded() {
  const rows = await db.select({ slug: lgpdTermoTemplatesTable.slug }).from(lgpdTermoTemplatesTable);
  const have = new Set(rows.map((r) => r.slug));
  const missing = DEFAULT_TEMPLATES.filter((t) => !have.has(t.slug));
  if (missing.length > 0) {
    await db.insert(lgpdTermoTemplatesTable).values(
      missing.map((t) => ({
        slug: t.slug,
        titulo: t.titulo,
        descricao: t.descricao,
        corpo: t.corpo,
        versao: 1,
      })),
    );
  }
}

router.get("/admin/lgpd-templates", async (_req, res): Promise<void> => {
  await ensureSeeded();
  const rows = await db.select().from(lgpdTermoTemplatesTable);
  // Order by the canonical TEMPLATE_SLUGS order
  const order = new Map(TEMPLATE_SLUGS.map((s, i) => [s, i] as const));
  rows.sort((a, b) => (order.get(a.slug) ?? 999) - (order.get(b.slug) ?? 999));
  res.json(
    rows.map((r) => ({
      slug: r.slug,
      titulo: r.titulo,
      descricao: r.descricao,
      corpo: r.corpo,
      versao: r.versao,
      updatedAt: r.updatedAt.toISOString(),
    })),
  );
});

const PatchBody = z.object({
  titulo: z.string().min(2).optional(),
  descricao: z.string().min(2).optional(),
  corpo: z.string().min(20).optional(),
});

router.patch("/admin/lgpd-templates/:slug", async (req, res): Promise<void> => {
  const slug = req.params.slug as string;
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureSeeded();

  const [existing] = await db.select().from(lgpdTermoTemplatesTable).where(eq(lgpdTermoTemplatesTable.slug, slug));
  if (!existing) {
    res.status(404).json({ error: "Template não encontrado" });
    return;
  }

  // Detect actual content changes — we only bump the version when the wording changes.
  const titulo = parsed.data.titulo ?? existing.titulo;
  const descricao = parsed.data.descricao ?? existing.descricao;
  const corpo = parsed.data.corpo ?? existing.corpo;

  const contentChanged = corpo !== existing.corpo || titulo !== existing.titulo;
  const newVersion = contentChanged ? existing.versao + 1 : existing.versao;

  const [updated] = await db
    .update(lgpdTermoTemplatesTable)
    .set({
      titulo,
      descricao,
      corpo,
      versao: newVersion,
      updatedAt: new Date(),
    })
    .where(eq(lgpdTermoTemplatesTable.slug, slug))
    .returning();

  res.json({
    slug: updated.slug,
    titulo: updated.titulo,
    descricao: updated.descricao,
    corpo: updated.corpo,
    versao: updated.versao,
    updatedAt: updated.updatedAt.toISOString(),
  });
});

router.post("/admin/lgpd-templates/:slug/preview-pdf", async (req, res): Promise<void> => {
  const slug = req.params.slug as string;

  // Optional override body — useful for "live preview" while the admin is editing.
  const overrideSchema = z.object({
    titulo: z.string().optional(),
    corpo: z.string().optional(),
  });
  const override = overrideSchema.safeParse(req.body ?? {});
  const overrideData = override.success ? override.data : {};

  await ensureSeeded();
  const [tpl] = await db.select().from(lgpdTermoTemplatesTable).where(eq(lgpdTermoTemplatesTable.slug, slug));
  if (!tpl) {
    res.status(404).json({ error: "Template não encontrado" });
    return;
  }

  const contratada: ContratadaInfo = {
    razao_social: (await getConfig("contratada_razao_social")) ?? "BLU SOLLUTTIONS LTDA",
    cnpj: (await getConfig("contratada_cnpj")) ?? "55.190.026/0001-31",
    endereco: (await getConfig("contratada_endereco")) ?? "Av. Brasil 2125, sala 04-A",
    cidade_uf: (await getConfig("contratada_cidade_uf")) ?? "Sorriso/MT",
    cep: (await getConfig("contratada_cep")) ?? "78.890-126",
    representante_nome: (await getConfig("contratada_representante_nome")) ?? "Rafaela Calgaro",
    representante_cpf: (await getConfig("contratada_representante_cpf")) ?? "032.539.209-92",
    representante_cargo: (await getConfig("contratada_representante_cargo")) ?? "Sócia-Administradora",
  };

  const contratante: ContratanteInfo = {
    razao_social: "[Razão social da clínica]",
    nome_fantasia: "[Nome fantasia]",
    cnpj: "00.000.000/0000-00",
    endereco: "[Endereço da clínica]",
    cidade_uf: "[Cidade/UF]",
    cep: "00000-000",
    responsavel: "[Responsável da clínica]",
  };

  const { bytes } = await renderTermoPdf({
    titulo: overrideData.titulo ?? tpl.titulo,
    corpo: overrideData.corpo ?? tpl.corpo,
    versao: tpl.versao,
    contratada,
    contratante,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="preview-${tpl.slug}.pdf"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(Buffer.from(bytes));
});

export default router;
