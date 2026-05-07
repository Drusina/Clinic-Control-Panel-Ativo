import { pdfToPng } from "pdf-to-png-converter";
import { PdfExtractionError } from "./aiSummarizer.js";

export interface RenderedPage {
  pageNumber: number;
  pngBuffer: Buffer;
  width: number;
  height: number;
}

export interface RenderPdfResult {
  pages: RenderedPage[];
  totalPages: number;
  truncated: boolean;
}

export interface RenderPdfOptions {
  maxPages?: number;
  viewportScale?: number;
}

export const DEFAULT_MAX_VISION_PAGES = 8;
export const DEFAULT_RENDER_SCALE = 2;

export async function renderPdfPagesToImages(
  fileBuffer: Buffer,
  options: RenderPdfOptions = {},
): Promise<RenderPdfResult> {
  const maxPages = Math.max(1, options.maxPages ?? DEFAULT_MAX_VISION_PAGES);
  const viewportScale = options.viewportScale ?? DEFAULT_RENDER_SCALE;

  let metaPages: Array<{ pageNumber: number }>;
  try {
    const meta = await pdfToPng(fileBuffer, { returnMetadataOnly: true });
    metaPages = meta;
  } catch (err) {
    const message = (err as Error).message ?? "";
    if (/password|encrypt/i.test(message)) {
      throw new PdfExtractionError(
        "PDF protegido por senha. Remova a proteção e reenvie.",
      );
    }
    throw new PdfExtractionError(
      `Não foi possível inspecionar o PDF para renderização (${message || "erro desconhecido"}).`,
    );
  }

  const totalPages = metaPages.length;
  if (totalPages === 0) {
    throw new PdfExtractionError("PDF não contém páginas.");
  }

  const pageNumbers: number[] = [];
  for (let i = 1; i <= Math.min(totalPages, maxPages); i++) pageNumbers.push(i);
  const truncated = totalPages > maxPages;

  let rendered;
  try {
    rendered = await pdfToPng(fileBuffer, {
      viewportScale,
      pagesToProcess: pageNumbers,
      returnPageContent: true,
      disableFontFace: true,
    });
  } catch (err) {
    const message = (err as Error).message ?? "";
    if (/password|encrypt/i.test(message)) {
      throw new PdfExtractionError(
        "PDF protegido por senha. Remova a proteção e reenvie.",
      );
    }
    throw new PdfExtractionError(
      `Falha ao renderizar páginas do PDF: ${message || "erro desconhecido"}.`,
    );
  }

  const pages: RenderedPage[] = rendered
    .filter((p) => p.content && p.content.byteLength > 0)
    .map((p) => ({
      pageNumber: p.pageNumber,
      pngBuffer: p.content as Buffer,
      width: p.width,
      height: p.height,
    }));

  if (pages.length === 0) {
    throw new PdfExtractionError(
      "Nenhuma página do PDF pôde ser renderizada como imagem.",
    );
  }

  return { pages, totalPages, truncated };
}
