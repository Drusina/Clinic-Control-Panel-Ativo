import OpenAI from "openai";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import {
  renderPdfPagesToImages,
  DEFAULT_MAX_VISION_PAGES,
} from "./pdfRender.js";

const MAX_INPUT_CHARS = 8_000;
// Cost cap mandated by the task spec: ~300 words of output.
const MAX_OUTPUT_TOKENS = 800;
const MODEL = "gpt-5-mini";
// gpt-5 reasoning models burn internal tokens before the visible answer.
// "minimal" disables that overhead so the 800-token cap holds for output.
const REASONING_EFFORT = "minimal" as const;

const SYSTEM_PROMPT =
  "Você é um assistente jurídico/administrativo de uma clínica médica. " +
  "Analise o documento e forneça resumo executivo conciso em PT-BR cobrindo: " +
  "1) Tipo e natureza, 2) Partes envolvidas (se aplicável), " +
  "3) Principais pontos/decisões/cláusulas, 4) Data e vigência (se aplicável), " +
  "5) Observações relevantes. Seja objetivo, máximo 300 palavras.";

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (cachedClient) return cachedClient;

  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

  if (!baseURL || !apiKey) {
    throw new Error(
      "Integração OpenAI não configurada (AI_INTEGRATIONS_OPENAI_BASE_URL/API_KEY).",
    );
  }

  cachedClient = new OpenAI({ baseURL, apiKey });
  return cachedClient;
}

export class UnsupportedFileTypeError extends Error {
  constructor(public mimeType: string | null) {
    super(
      `Tipo de arquivo não suportado para resumo (${mimeType ?? "desconhecido"}). Apenas PDF e texto.`,
    );
    this.name = "UnsupportedFileTypeError";
  }
}

export class EmptyDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmptyDocumentError";
  }
}

export class PdfExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfExtractionError";
  }
}

function isSupportedMimeType(mime: string | null | undefined): boolean {
  if (!mime) return false;
  if (mime === "application/pdf") return true;
  if (mime.startsWith("text/")) return true;
  return false;
}

async function extractText(
  fileBuffer: Buffer,
  mimeType: string | null | undefined,
): Promise<string> {
  if (!isSupportedMimeType(mimeType)) {
    throw new UnsupportedFileTypeError(mimeType ?? null);
  }

  if (mimeType === "application/pdf") {
    let parsed: { text?: string };
    try {
      parsed = await pdfParse(fileBuffer);
    } catch (err) {
      const message = (err as Error).message ?? "";
      if (/password|encrypt/i.test(message)) {
        throw new PdfExtractionError(
          "Este PDF está protegido por senha. Remova a proteção e tente novamente.",
        );
      }
      throw new PdfExtractionError(
        "Não foi possível extrair texto do PDF. Pode estar corrompido ou conter apenas imagens.",
      );
    }
    const text = (parsed.text ?? "").trim();
    if (!text) {
      throw new EmptyDocumentError(
        "Este PDF não contém texto extraível (provavelmente apenas imagens). Para esses casos, ainda não geramos resumo.",
      );
    }
    return text;
  }

  // text/* — UTF-8 with replacement characters as fallback
  const text = fileBuffer.toString("utf8").trim();
  if (!text) {
    throw new EmptyDocumentError("O arquivo está vazio.");
  }
  return text;
}

export type AnalysisMode = "text" | "vision";

export interface SummarizeResult {
  summary: string;
  charsAnalyzed: number;
  truncated: boolean;
  analysisMode: AnalysisMode;
  pagesAnalyzed: number;
  totalPages: number;
}

async function summarizeFromImages(
  fileBuffer: Buffer,
): Promise<SummarizeResult> {
  const { pages, totalPages, truncated } = await renderPdfPagesToImages(
    fileBuffer,
    { maxPages: DEFAULT_MAX_VISION_PAGES },
  );

  const noteIfTruncated = truncated
    ? `ATENÇÃO: este PDF tem ${totalPages} páginas; só as primeiras ${pages.length} foram enviadas para análise.\n\n`
    : "";

  const imageContent = pages.map((p) => ({
    type: "image_url" as const,
    image_url: {
      url: `data:image/png;base64,${p.pngBuffer.toString("base64")}`,
      detail: "high" as const,
    },
  }));

  const client = getClient();
  let response;
  try {
    response = await client.chat.completions.create({
      model: MODEL,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      reasoning_effort: REASONING_EFFORT,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                noteIfTruncated +
                "As imagens a seguir são páginas de um PDF escaneado (sem camada de texto). Leia o conteúdo das imagens — incluindo carimbos, assinaturas e textos manuscritos quando legíveis — e produza o resumo executivo solicitado.",
            },
            ...imageContent,
          ],
        },
      ],
    });
  } catch (err) {
    throw new Error(
      `Falha ao analisar imagens do PDF com a IA: ${(err as Error).message}`,
    );
  }

  const summary = response.choices[0]?.message?.content?.trim() ?? "";
  if (!summary) {
    throw new Error("A IA retornou resposta vazia para a análise visual.");
  }

  return {
    summary,
    charsAnalyzed: 0,
    truncated,
    analysisMode: "vision",
    pagesAnalyzed: pages.length,
    totalPages,
  };
}

export async function summarizeDocument(
  fileBuffer: Buffer,
  mimeType: string | null | undefined,
): Promise<SummarizeResult> {
  let fullText: string;
  try {
    fullText = await extractText(fileBuffer, mimeType);
  } catch (err) {
    // Fallback to vision only for scanned PDFs (no text layer).
    if (err instanceof EmptyDocumentError && mimeType === "application/pdf") {
      return summarizeFromImages(fileBuffer);
    }
    throw err;
  }

  const truncated = fullText.length > MAX_INPUT_CHARS;
  const text = truncated ? fullText.slice(0, MAX_INPUT_CHARS) : fullText;

  const client = getClient();

  let response;
  try {
    response = await client.chat.completions.create({
      model: MODEL,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      reasoning_effort: REASONING_EFFORT,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            (truncated
              ? "ATENÇÃO: o texto abaixo foi truncado para análise.\n\n"
              : "") + text,
        },
      ],
    });
  } catch (err) {
    const message = (err as Error).message ?? "Falha desconhecida";
    throw new Error(`Falha ao chamar IA: ${message}`);
  }

  const summary = response.choices[0]?.message?.content?.trim() ?? "";
  if (!summary) {
    throw new Error("A IA retornou um resumo vazio. Tente novamente.");
  }

  return {
    summary,
    charsAnalyzed: text.length,
    truncated,
    analysisMode: "text",
    pagesAnalyzed: 0,
    totalPages: 0,
  };
}

export function isSummarizableMimeType(
  mime: string | null | undefined,
): boolean {
  return isSupportedMimeType(mime);
}
