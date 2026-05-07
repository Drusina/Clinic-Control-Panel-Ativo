import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  clinicDocumentsTable,
  documentCategoriesTable,
  clinicsTable,
  sociosTable,
  societaryExtractionsTable,
} from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { signToken } from "../middleware/auth.js";
import {
  extractSocietary,
  isExtractableMimeType,
  type SocietaryExtraction,
  type AnalysisMode,
} from "../lib/societaryExtractor.js";
import {
  EmptyDocumentError,
  PdfExtractionError,
  UnsupportedFileTypeError,
} from "../lib/aiSummarizer.js";
import { buildProfessionalTitle } from "../lib/professionalTitle.js";

const objectStorageService = new ObjectStorageService();
const SIGNED_URL_TTL_SECONDS = 3600;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SOCIETARY_CATEGORY_NAME = "Contratos e Aditivos";

const VALID_TIPOS = new Set(["contrato_social", "alteracao", "acordo_socios", "outro"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

const router: IRouter = Router();

function uploadSingle(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          error: `Arquivo excede o limite de ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB`,
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Falha ao processar upload";
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}

function decodeMultipartFilename(name: string): string {
  if (!name) return name;
  let out = name;
  if (/[\u0080-\u00ff]/.test(name)) {
    try {
      const reinterpreted = Buffer.from(name, "latin1").toString("utf8");
      if (!reinterpreted.includes("\uFFFD")) out = reinterpreted;
    } catch {
      /* keep original */
    }
  }
  return out.normalize("NFC");
}

async function ensureSocietaryCategory(clinicId: string): Promise<string> {
  const existing = await db
    .select()
    .from(documentCategoriesTable)
    .where(
      and(
        eq(documentCategoriesTable.clinicId, clinicId),
        sql`lower(${documentCategoriesTable.name}) = lower(${SOCIETARY_CATEGORY_NAME})`,
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [created] = await db
    .insert(documentCategoriesTable)
    .values({ clinicId, name: SOCIETARY_CATEGORY_NAME, ordem: 0 })
    .returning();
  return created.id;
}

interface MappedExtraction {
  id: string;
  clinicId: string;
  documentId: string;
  tipo: string;
  status: string;
  errorMessage: string | null;
  extraction: SocietaryExtraction | null;
  analysisMode: AnalysisMode | null;
  truncated: boolean;
  pagesAnalyzed: number | null;
  totalPages: number | null;
  appliedAt: string | null;
  createdAt: string;
  document: {
    id: string;
    title: string;
    fileName: string;
    fileType: string | null;
    fileSize: number | null;
    storagePath: string;
    createdAt: string;
  };
}

function readAnalysisMode(ext: unknown): AnalysisMode | null {
  if (ext && typeof ext === "object" && "_analysis_mode" in ext) {
    const v = (ext as Record<string, unknown>)._analysis_mode;
    if (v === "text" || v === "vision") return v;
  }
  return null;
}

function readMetaBool(ext: unknown, key: string): boolean {
  if (ext && typeof ext === "object" && key in ext) {
    return (ext as Record<string, unknown>)[key] === true;
  }
  return false;
}

function readMetaNumber(ext: unknown, key: string): number | null {
  if (ext && typeof ext === "object" && key in ext) {
    const v = (ext as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function mapRow(
  e: typeof societaryExtractionsTable.$inferSelect,
  d: typeof clinicDocumentsTable.$inferSelect,
): MappedExtraction {
  return {
    id: e.id,
    clinicId: e.clinicId,
    documentId: e.documentId,
    tipo: e.tipo,
    status: e.status,
    errorMessage: e.errorMessage ?? null,
    extraction: (e.extraction as SocietaryExtraction | null) ?? null,
    analysisMode: readAnalysisMode(e.extraction),
    truncated: readMetaBool(e.extraction, "_truncated"),
    pagesAnalyzed: readMetaNumber(e.extraction, "_pages_analyzed"),
    totalPages: readMetaNumber(e.extraction, "_total_pages"),
    appliedAt: e.appliedAt ? e.appliedAt.toISOString() : null,
    createdAt: e.createdAt.toISOString(),
    document: {
      id: d.id,
      title: d.title,
      fileName: d.fileName,
      fileType: d.fileType ?? null,
      fileSize: d.fileSize ?? null,
      storagePath: d.storagePath,
      createdAt: d.createdAt.toISOString(),
    },
  };
}

router.get(
  "/clinics/:clinicId/societary-docs",
  async (req, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId)
      ? req.params.clinicId[0]
      : req.params.clinicId;

    const rows = await db
      .select({ e: societaryExtractionsTable, d: clinicDocumentsTable })
      .from(societaryExtractionsTable)
      .innerJoin(
        clinicDocumentsTable,
        eq(clinicDocumentsTable.id, societaryExtractionsTable.documentId),
      )
      .where(eq(societaryExtractionsTable.clinicId, clinicId))
      .orderBy(desc(societaryExtractionsTable.createdAt));

    res.json(rows.map((r) => mapRow(r.e, r.d)));
  },
);

router.get(
  "/clinics/:clinicId/societary-docs/:id/signed-url",
  async (req, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId)
      ? req.params.clinicId[0]
      : req.params.clinicId;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const [row] = await db
      .select({ d: clinicDocumentsTable })
      .from(societaryExtractionsTable)
      .innerJoin(
        clinicDocumentsTable,
        eq(clinicDocumentsTable.id, societaryExtractionsTable.documentId),
      )
      .where(
        and(
          eq(societaryExtractionsTable.id, id),
          eq(societaryExtractionsTable.clinicId, clinicId),
        ),
      );

    if (!row) {
      res.status(404).json({ error: "Documento não encontrado" });
      return;
    }
    if (!row.d.storagePath.startsWith("/objects/")) {
      res.status(410).json({ error: "Arquivo armazenado em local legado." });
      return;
    }
    const wildcardPath = row.d.storagePath.slice("/objects/".length);
    const sigToken = signToken(
      { purpose: "signed_object_url", path: row.d.storagePath },
      SIGNED_URL_TTL_SECONDS,
    );
    res.json({
      url: `/api/storage/objects/${wildcardPath}?sig=${encodeURIComponent(sigToken)}`,
    });
  },
);

router.post(
  "/clinics/:clinicId/societary-docs",
  uploadSingle,
  async (req: Request, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId)
      ? req.params.clinicId[0]
      : req.params.clinicId;

    const file = (req as Request & { file?: Express.Multer.File }).file;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const tipoRaw = typeof body.tipo === "string" ? body.tipo : "outro";
    const tipo = VALID_TIPOS.has(tipoRaw) ? tipoRaw : "outro";
    const titleRaw = typeof body.title === "string" ? body.title : "";

    if (!file) {
      res.status(400).json({ error: "Arquivo (campo 'file') é obrigatório" });
      return;
    }

    const fileName = decodeMultipartFilename(file.originalname || "documento.pdf");
    const mimeType = file.mimetype || "application/pdf";

    if (mimeType !== "application/pdf" || !isExtractableMimeType(mimeType)) {
      res.status(415).json({
        error: `Tipo não suportado para análise societária: ${mimeType}. Envie um arquivo PDF.`,
      });
      return;
    }

    // Validate clinic exists
    const [clinic] = await db
      .select({ id: clinicsTable.id })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId));
    if (!clinic) {
      res.status(404).json({ error: "Clínica não encontrada" });
      return;
    }

    // Upload to object storage
    let storagePath: string;
    let size: number;
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: file.buffer,
      });
      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Upload falhou: ${errText}`);
      }
      storagePath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      size = file.buffer.byteLength;
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
      return;
    }

    const categoryId = await ensureSocietaryCategory(clinicId);

    // Run AI extraction first (best-effort: we still persist the doc + an
    // extraction row in error state if the AI call fails, so the UI always
    // has a placeholder linked to the document).
    let extraction: SocietaryExtraction | null = null;
    let analysisMode: AnalysisMode | null = null;
    let truncated = false;
    let pagesAnalyzed = 0;
    let totalPages = 0;
    let status = "ready";
    let errorMessage: string | null = null;
    try {
      const out = await extractSocietary(file.buffer, mimeType);
      extraction = out.extraction;
      analysisMode = out.analysisMode;
      truncated = out.truncated;
      pagesAnalyzed = out.pagesAnalyzed;
      totalPages = out.totalPages;
    } catch (err) {
      status = "error";
      if (
        err instanceof UnsupportedFileTypeError ||
        err instanceof EmptyDocumentError ||
        err instanceof PdfExtractionError
      ) {
        errorMessage = err.message;
      } else {
        errorMessage =
          (err as Error).message ?? "Falha ao analisar o documento com IA.";
      }
    }

    const finalTipo =
      tipo !== "outro" ? tipo : (extraction?.tipo_detectado ?? "outro");

    // If the operator did not supply an explicit title, use the professional
    // title generated from AI extraction (when ready). Falls back to the
    // raw filename when extraction failed or returned nothing useful.
    const userProvidedTitle = titleRaw.trim().length > 0;
    const computedTitle = userProvidedTitle
      ? titleRaw.trim()
      : buildProfessionalTitle({
          tipo: finalTipo,
          razaoSocial: extraction?.razao_social ?? null,
          dataReferencia: extraction?.data_referencia ?? null,
          fallbackFileName: fileName,
        });

    // Persist clinic_documents + societary_extractions atomically so the UI
    // never sees a doc without its analysis row (or vice versa).
    const { docRow, extRow } = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM clinics WHERE id = ${clinicId} FOR UPDATE`);
      const last = await tx
        .select({ seq: clinicDocumentsTable.sequenceNumber })
        .from(clinicDocumentsTable)
        .where(eq(clinicDocumentsTable.clinicId, clinicId))
        .orderBy(desc(clinicDocumentsTable.sequenceNumber))
        .limit(1);
      const nextSeq = (last[0]?.seq ?? 0) + 1;

      const summary = extraction?.resumo ?? null;
      const [insertedDoc] = await tx
        .insert(clinicDocumentsTable)
        .values({
          clinicId,
          categoryId,
          sequenceNumber: nextSeq,
          title: computedTitle,
          fileName,
          storagePath,
          fileSize: size,
          fileType: mimeType,
          summary,
          summarizedAt: summary ? new Date() : null,
        })
        .returning();

      const persistedExtraction: Record<string, unknown> = {
        ...((extraction ?? {}) as Record<string, unknown>),
      };
      if (analysisMode) persistedExtraction._analysis_mode = analysisMode;
      if (truncated) persistedExtraction._truncated = true;
      if (pagesAnalyzed > 0) persistedExtraction._pages_analyzed = pagesAnalyzed;
      if (totalPages > 0) persistedExtraction._total_pages = totalPages;

      const [insertedExt] = await tx
        .insert(societaryExtractionsTable)
        .values({
          clinicId,
          documentId: insertedDoc.id,
          tipo: finalTipo,
          extraction: persistedExtraction,
          status,
          errorMessage,
        })
        .returning();

      return { docRow: insertedDoc, extRow: insertedExt };
    });

    res.status(201).json(mapRow(extRow, docRow));
  },
);

interface ApplyBody {
  applyCapitalSocial?: boolean;
  socioIndices?: number[]; // indices into extraction.socios
}

function normalizeName(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function digitsOnly(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\D+/g, "");
}

router.post(
  "/clinics/:clinicId/societary-docs/:id/apply",
  async (req, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId)
      ? req.params.clinicId[0]
      : req.params.clinicId;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const body = (req.body ?? {}) as ApplyBody;
    const wantsCapital = body.applyCapitalSocial === true;
    const wantedIdx = new Set(
      Array.isArray(body.socioIndices) ? body.socioIndices : [],
    );

    const [extRow] = await db
      .select()
      .from(societaryExtractionsTable)
      .where(
        and(
          eq(societaryExtractionsTable.id, id),
          eq(societaryExtractionsTable.clinicId, clinicId),
        ),
      );

    if (!extRow) {
      res.status(404).json({ error: "Extração não encontrada" });
      return;
    }
    if (extRow.status !== "ready") {
      res.status(400).json({
        error: "Esta extração não está pronta para aplicar.",
      });
      return;
    }

    const extraction = extRow.extraction as SocietaryExtraction;

    const result = await db.transaction(async (tx) => {
      let capitalUpdated = false;

      // Apply capital social — only when current value is null/empty
      if (wantsCapital && extraction.capital_social != null) {
        const [clinic] = await tx
          .select({ capitalSocial: clinicsTable.capitalSocial })
          .from(clinicsTable)
          .where(eq(clinicsTable.id, clinicId))
          .for("update");
        const current = clinic?.capitalSocial;
        const isEmpty =
          current == null ||
          current === "" ||
          (typeof current === "string" && current.trim() === "");
        if (clinic && isEmpty) {
          await tx
            .update(clinicsTable)
            .set({ capitalSocial: String(extraction.capital_social) })
            .where(eq(clinicsTable.id, clinicId));
          capitalUpdated = true;
        }
      }

      // Apply sócios
      const existing = await tx
        .select()
        .from(sociosTable)
        .where(eq(sociosTable.clinicId, clinicId));

      const created: string[] = [];
      const updated: string[] = [];

      const candidates = (extraction.socios ?? []).filter((_s, i) =>
        wantedIdx.has(i),
      );

      for (const cand of candidates) {
        const candCpf = digitsOnly(cand.cpf ?? null);
        const candName = normalizeName(cand.nome);
        const match = existing.find((s) => {
          if (candCpf && s.cpf && digitsOnly(s.cpf) === candCpf) return true;
          if (normalizeName(s.nome) === candName) return true;
          return false;
        });

        if (match) {
          const patch: Partial<typeof sociosTable.$inferInsert> & {
            updatedAt: Date;
          } = { updatedAt: new Date() };
          if (!match.cpf && candCpf) patch.cpf = candCpf;
          if (match.percentual == null && cand.percentual != null) {
            patch.percentual = String(cand.percentual);
          }
          if (match.valorQuotas == null && cand.valor_quotas != null) {
            patch.valorQuotas = String(cand.valor_quotas);
          }
          if (!match.qualificacao && cand.qualificacao) {
            patch.qualificacao = cand.qualificacao;
          }
          await tx
            .update(sociosTable)
            .set(patch)
            .where(eq(sociosTable.id, match.id));
          updated.push(match.id);
        } else {
          const [row] = await tx
            .insert(sociosTable)
            .values({
              clinicId,
              nome: cand.nome,
              cpf: candCpf || null,
              percentual: cand.percentual != null ? String(cand.percentual) : null,
              valorQuotas:
                cand.valor_quotas != null ? String(cand.valor_quotas) : null,
              qualificacao: cand.qualificacao ?? null,
              origem: "ia_societario",
            })
            .returning({ id: sociosTable.id });
          created.push(row.id);
        }
      }

      await tx
        .update(societaryExtractionsTable)
        .set({ appliedAt: new Date() })
        .where(eq(societaryExtractionsTable.id, id));

      return { capitalUpdated, created, updated };
    });

    res.json({
      capitalUpdated: result.capitalUpdated,
      sociosCreated: result.created.length,
      sociosUpdated: result.updated.length,
    });
  },
);

router.post(
  "/clinics/:clinicId/societary-docs/:id/reanalyze",
  async (req, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId)
      ? req.params.clinicId[0]
      : req.params.clinicId;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const [row] = await db
      .select({ e: societaryExtractionsTable, d: clinicDocumentsTable })
      .from(societaryExtractionsTable)
      .innerJoin(
        clinicDocumentsTable,
        eq(clinicDocumentsTable.id, societaryExtractionsTable.documentId),
      )
      .where(
        and(
          eq(societaryExtractionsTable.id, id),
          eq(societaryExtractionsTable.clinicId, clinicId),
        ),
      );

    if (!row) {
      res.status(404).json({ error: "Extração não encontrada" });
      return;
    }

    if (!row.d.storagePath.startsWith("/objects/")) {
      res.status(410).json({
        error: "Arquivo armazenado em local legado — não é possível re-analisar.",
      });
      return;
    }

    let fileBuffer: Buffer;
    try {
      const file = await objectStorageService.getObjectEntityFile(
        row.d.storagePath,
      );
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        const stream = file.createReadStream();
        stream.on("data", (c: Buffer) => chunks.push(c));
        stream.on("end", () => resolve());
        stream.on("error", (e: Error) => reject(e));
      });
      fileBuffer = Buffer.concat(chunks);
    } catch (err) {
      res.status(500).json({
        error: `Falha ao baixar o arquivo do storage: ${(err as Error).message}`,
      });
      return;
    }

    const mimeType = row.d.fileType ?? "application/pdf";
    let extraction: SocietaryExtraction | null = null;
    let analysisMode: AnalysisMode | null = null;
    let truncated = false;
    let pagesAnalyzed = 0;
    let totalPages = 0;
    let status = "ready";
    let errorMessage: string | null = null;

    try {
      const out = await extractSocietary(fileBuffer, mimeType);
      extraction = out.extraction;
      analysisMode = out.analysisMode;
      truncated = out.truncated;
      pagesAnalyzed = out.pagesAnalyzed;
      totalPages = out.totalPages;
    } catch (err) {
      status = "error";
      if (
        err instanceof UnsupportedFileTypeError ||
        err instanceof EmptyDocumentError ||
        err instanceof PdfExtractionError
      ) {
        errorMessage = err.message;
      } else {
        errorMessage =
          (err as Error).message ?? "Falha ao analisar o documento com IA.";
      }
    }

    const finalTipo =
      row.e.tipo && row.e.tipo !== "outro"
        ? row.e.tipo
        : (extraction?.tipo_detectado ?? row.e.tipo ?? "outro");

    // Update title only if the previous title looked like a raw filename
    // (still equal to fileName) — never overwrite an operator-edited title.
    const titleLooksLikeFilename = row.d.title === row.d.fileName;
    let newTitle: string | null = null;
    if (status === "ready" && titleLooksLikeFilename) {
      newTitle = buildProfessionalTitle({
        tipo: finalTipo,
        razaoSocial: extraction?.razao_social ?? null,
        dataReferencia: extraction?.data_referencia ?? null,
        fallbackFileName: row.d.fileName,
      });
    }

    const result = await db.transaction(async (tx) => {
      const persistedExtraction: Record<string, unknown> = {
        ...((extraction ?? {}) as Record<string, unknown>),
      };
      if (analysisMode) persistedExtraction._analysis_mode = analysisMode;
      if (truncated) persistedExtraction._truncated = true;
      if (pagesAnalyzed > 0) persistedExtraction._pages_analyzed = pagesAnalyzed;
      if (totalPages > 0) persistedExtraction._total_pages = totalPages;

      const [updatedExt] = await tx
        .update(societaryExtractionsTable)
        .set({
          tipo: finalTipo,
          extraction: persistedExtraction,
          status,
          errorMessage,
          appliedAt: null,
        })
        .where(eq(societaryExtractionsTable.id, id))
        .returning();

      let updatedDoc = row.d;
      if (newTitle) {
        const [doc] = await tx
          .update(clinicDocumentsTable)
          .set({
            title: newTitle,
            summary: extraction?.resumo ?? row.d.summary,
            summarizedAt: extraction?.resumo ? new Date() : row.d.summarizedAt,
          })
          .where(eq(clinicDocumentsTable.id, row.d.id))
          .returning();
        updatedDoc = doc;
      } else if (status === "ready" && extraction?.resumo) {
        const [doc] = await tx
          .update(clinicDocumentsTable)
          .set({
            summary: extraction.resumo,
            summarizedAt: new Date(),
          })
          .where(eq(clinicDocumentsTable.id, row.d.id))
          .returning();
        updatedDoc = doc;
      }

      return { ext: updatedExt, doc: updatedDoc };
    });

    res.json(mapRow(result.ext, result.doc));
  },
);

router.delete(
  "/clinics/:clinicId/societary-docs/:id",
  async (req, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId)
      ? req.params.clinicId[0]
      : req.params.clinicId;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const [row] = await db
      .select({ documentId: societaryExtractionsTable.documentId })
      .from(societaryExtractionsTable)
      .where(
        and(
          eq(societaryExtractionsTable.id, id),
          eq(societaryExtractionsTable.clinicId, clinicId),
        ),
      );
    if (!row) {
      res.status(404).json({ error: "Extração não encontrada" });
      return;
    }

    // Delete extraction; document remains in the library
    await db
      .delete(societaryExtractionsTable)
      .where(eq(societaryExtractionsTable.id, id));

    res.json({ success: true });
  },
);

export default router;
