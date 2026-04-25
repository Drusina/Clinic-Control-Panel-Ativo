import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import { db, lgpdTermosTable } from "@workspace/db";
import { getConfig } from "../lib/config.js";

const PatchLgpdTermoBody = z.object({
  status: z.string().optional(),
  metodo: z.string().nullable().optional(),
  autentiqueDocId: z.string().nullable().optional(),
  acaoUrl: z.string().nullable().optional(),
  signatarioNome: z.string().nullable().optional(),
  signatarioEmail: z.string().nullable().optional(),
  assinadoEm: z.string().nullable().optional(),
  storagePath: z.string().nullable().optional(),
  enviadoEm: z.string().nullable().optional(),
});

const router: IRouter = Router();

const FIXED_TERMS = [
  {
    slug: "termos-de-uso",
    nome: "Termos de Uso da Plataforma IONEX360",
    descricao: "Aceite dos termos de uso da plataforma de gestão IONEX360 pela clínica.",
  },
  {
    slug: "politica-privacidade",
    nome: "Política de Privacidade e LGPD",
    descricao: "Ciência e concordância com a política de privacidade e tratamento de dados conforme LGPD.",
  },
  {
    slug: "consentimento-dados",
    nome: "Consentimento para Tratamento de Dados Pessoais",
    descricao: "Autorização expressa para coleta e tratamento de dados pessoais de pacientes e colaboradores.",
  },
  {
    slug: "autorizacao-imagem",
    nome: "Autorização de Uso de Imagem e Depoimentos",
    descricao: "Permissão para uso de imagens, vídeos e depoimentos para fins de marketing e treinamento.",
  },
  {
    slug: "nda",
    nome: "Acordo de Confidencialidade (NDA)",
    descricao: "Termo de não divulgação de informações estratégicas e operacionais da clínica e da IONEX360.",
  },
  {
    slug: "responsabilidade-operador",
    nome: "Responsabilidade do Operador de Dados",
    descricao: "Declaração de responsabilidade da clínica como operadora de dados pessoais segundo a LGPD.",
  },
];

function mapTermo(t: typeof lgpdTermosTable.$inferSelect) {
  return {
    id: t.id,
    clinicId: t.clinicId,
    slug: t.slug,
    nome: t.nome,
    descricao: t.descricao ?? null,
    status: t.status,
    metodo: t.metodo ?? null,
    autentiqueDocId: t.autentiqueDocId ?? null,
    acaoUrl: t.acaoUrl ?? null,
    signatarioNome: t.signatarioNome ?? null,
    signatarioEmail: t.signatarioEmail ?? null,
    assinadoEm: t.assinadoEm?.toISOString() ?? null,
    storagePath: t.storagePath ?? null,
    enviadoEm: t.enviadoEm?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

async function seedFixedTerms(clinicId: string) {
  const existing = await db
    .select({ slug: lgpdTermosTable.slug })
    .from(lgpdTermosTable)
    .where(eq(lgpdTermosTable.clinicId, clinicId));

  const existingSlugs = new Set(existing.map(r => r.slug));
  const toInsert = FIXED_TERMS.filter(t => !existingSlugs.has(t.slug));

  if (toInsert.length > 0) {
    await db.insert(lgpdTermosTable).values(
      toInsert.map(t => ({ clinicId, ...t, status: "pendente" }))
    );
  }
}

router.get("/clinics/:clinicId/lgpd-termos", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  await seedFixedTerms(clinicId);

  const rows = await db
    .select()
    .from(lgpdTermosTable)
    .where(eq(lgpdTermosTable.clinicId, clinicId))
    .orderBy(lgpdTermosTable.createdAt);

  res.json(rows.map(mapTermo));
});

router.patch("/clinics/:clinicId/lgpd-termos/:termoId", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const termoId = Array.isArray(req.params.termoId) ? req.params.termoId[0] : req.params.termoId;

  const parsed = PatchLgpdTermoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const d = parsed.data;
  const updates: Partial<typeof lgpdTermosTable.$inferInsert> = {};
  if (d.status !== undefined) updates.status = d.status;
  if (d.metodo !== undefined) updates.metodo = d.metodo;
  if (d.autentiqueDocId !== undefined) updates.autentiqueDocId = d.autentiqueDocId;
  if (d.acaoUrl !== undefined) updates.acaoUrl = d.acaoUrl;
  if (d.signatarioNome !== undefined) updates.signatarioNome = d.signatarioNome;
  if (d.signatarioEmail !== undefined) updates.signatarioEmail = d.signatarioEmail;
  if (d.assinadoEm !== undefined) updates.assinadoEm = d.assinadoEm ? new Date(d.assinadoEm) : null;
  if (d.storagePath !== undefined) updates.storagePath = d.storagePath;
  if (d.enviadoEm !== undefined) updates.enviadoEm = d.enviadoEm ? new Date(d.enviadoEm) : null;

  const [termo] = await db
    .update(lgpdTermosTable)
    .set(updates)
    .where(and(eq(lgpdTermosTable.id, termoId), eq(lgpdTermosTable.clinicId, clinicId)))
    .returning();

  if (!termo) {
    res.status(404).json({ error: "Termo not found" });
    return;
  }

  res.json(mapTermo(termo));
});

router.post("/clinics/:clinicId/lgpd-termos/:termoId/upload-pdf", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const termoId = Array.isArray(req.params.termoId) ? req.params.termoId[0] : req.params.termoId;

  const supabaseUrl = await getConfig("supabase_url");
  const serviceRoleKey = await getConfig("supabase_service_role_key");

  if (!supabaseUrl || !serviceRoleKey) {
    res.status(501).json({ error: "Supabase Storage não configurado. Acesse Configurações → Integrações." });
    return;
  }

  const { fileName, fileBase64, mimeType } = req.body;
  if (!fileName || !fileBase64) {
    res.status(400).json({ error: "fileName and fileBase64 are required" });
    return;
  }

  const storagePath = `clinics/${clinicId}/lgpd/${fileName}`;
  const fileBuffer = Buffer.from(fileBase64, "base64");

  const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/signed-docs/${storagePath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": mimeType ?? "application/pdf",
      "x-upsert": "true",
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    res.status(500).json({ error: `Upload failed: ${err}` });
    return;
  }

  const [termo] = await db
    .update(lgpdTermosTable)
    .set({
      storagePath,
      status: "anexado",
      metodo: "pdf_anexado",
      enviadoEm: new Date(),
    })
    .where(and(eq(lgpdTermosTable.id, termoId), eq(lgpdTermosTable.clinicId, clinicId)))
    .returning();

  if (!termo) {
    res.status(404).json({ error: "Termo not found" });
    return;
  }

  res.json(mapTermo(termo));
});

export default router;
