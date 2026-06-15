import OpenAI from "openai";
import { z } from "zod/v4";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { renderPdfPagesToImages } from "./pdfRender.js";
import {
  EmptyDocumentError,
  PdfExtractionError,
  UnsupportedFileTypeError,
} from "./aiSummarizer.js";
import {
  cleanFileNameAsTitle,
  formatDataReferencia,
} from "./professionalTitle.js";

const MAX_INPUT_CHARS = 12_000;
const MAX_OUTPUT_TOKENS = 300;
const MODEL = "gpt-5-mini";
const REASONING_EFFORT = "minimal" as const;
// Titles only need the opening pages of a scanned document.
const TITLE_VISION_PAGES = 2;

const MAX_TIPO_LEN = 60;
const MAX_ENTIDADE_LEN = 60;
const MAX_TITLE_LEN = 140;

const SYSTEM_PROMPT =
  "Você dá nomes objetivos, modulares e padronizados a documentos de uma " +
  "clínica/empresa. A partir do conteúdo, identifique o tipo do documento, a " +
  "entidade/parte principal e a data de referência. NUNCA invente dados — se um " +
  "campo não estiver no documento, devolva null. Responda apenas com JSON, sem markdown.";

const USER_INSTRUCTIONS = `Gere metadados para nomear o documento de forma objetiva e modular.
Identifique:
1. tipo_documento: rótulo curto e padronizado em PT-BR do tipo do documento \
(ex.: "Contrato Social", "5ª Alteração Contratual", "Acordo de Sócios", \
"Contrato de Prestação de Serviços", "Aditivo Contratual", "Termo de Rescisão", \
"Petição Inicial", "Sentença", "Procuração", "Nota Fiscal", "Certidão Negativa", \
"Alvará", "Laudo", "Relatório"). Inclua o número ordinal quando o próprio \
documento indicar (ex.: "5ª Alteração Contratual"). Máximo de 6 palavras.
2. entidade_principal: nome da empresa/pessoa ou das partes principais a que o \
documento se refere (preferir a razão social ou nome completo). Se houver duas \
partes claras, use "Parte A x Parte B". Máximo de 60 caracteres. null se indeterminado.
3. data_referencia: data mais representativa do documento (assinatura, emissão ou \
registro) em formato ISO YYYY-MM-DD (ou YYYY-MM / YYYY quando incompleta). null se ausente.

Devolva APENAS este JSON:
{"tipo_documento": "string" | null, "entidade_principal": "string" | null, "data_referencia": "string" | null}`;

const TitleExtractionSchema = z.object({
  tipo_documento: z.string().nullable().optional(),
  entidade_principal: z.string().nullable().optional(),
  data_referencia: z.string().nullable().optional(),
});

type TitleExtraction = z.infer<typeof TitleExtractionSchema>;

export type TitleSource = "ai" | "filename";

export interface SuggestTitleResult {
  title: string;
  source: TitleSource;
}

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

export function isTitleSuggestableMimeType(
  mime: string | null | undefined,
): boolean {
  if (!mime) return false;
  if (mime === "application/pdf") return true;
  if (mime.startsWith("text/")) return true;
  return false;
}

async function extractText(
  fileBuffer: Buffer,
  mimeType: string | null | undefined,
): Promise<string> {
  if (mimeType === "application/pdf") {
    let parsed: { text?: string };
    try {
      parsed = await pdfParse(fileBuffer);
    } catch (err) {
      const message = (err as Error).message ?? "";
      if (/password|encrypt/i.test(message)) {
        throw new PdfExtractionError(
          "PDF protegido por senha. Remova a proteção e reenvie.",
        );
      }
      throw new PdfExtractionError(
        "Não foi possível extrair texto do PDF. Pode estar corrompido.",
      );
    }
    const text = (parsed.text ?? "").trim();
    if (!text) {
      throw new EmptyDocumentError(
        "PDF sem camada de texto (provavelmente escaneado).",
      );
    }
    return text;
  }
  if (mimeType && mimeType.startsWith("text/")) {
    const text = fileBuffer.toString("utf8").trim();
    if (!text) throw new EmptyDocumentError("O arquivo está vazio.");
    return text;
  }
  throw new UnsupportedFileTypeError(mimeType ?? null);
}

function parseAiJson(raw: string): TitleExtraction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("A IA retornou JSON inválido.");
  }
  const safe = TitleExtractionSchema.safeParse(parsed);
  if (!safe.success) {
    throw new Error("A IA retornou um JSON em formato inesperado.");
  }
  return safe.data;
}

async function extractFromText(fullText: string): Promise<TitleExtraction> {
  const text =
    fullText.length > MAX_INPUT_CHARS ? fullText.slice(0, MAX_INPUT_CHARS) : fullText;
  const client = getClient();
  let response;
  try {
    response = await client.chat.completions.create({
      model: MODEL,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      reasoning_effort: REASONING_EFFORT,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${USER_INSTRUCTIONS}\n\nCONTEÚDO:\n${text}` },
      ],
    });
  } catch (err) {
    throw new Error(`Falha ao chamar IA: ${(err as Error).message}`);
  }
  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) throw new Error("A IA retornou resposta vazia.");
  return parseAiJson(raw);
}

async function extractFromImages(fileBuffer: Buffer): Promise<TitleExtraction> {
  const { pages } = await renderPdfPagesToImages(fileBuffer, {
    maxPages: TITLE_VISION_PAGES,
  });
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
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `${USER_INSTRUCTIONS}\n\nAs imagens a seguir são páginas iniciais de um ` +
                "PDF escaneado (sem camada de texto). Leia o conteúdo e devolva o JSON solicitado.",
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
  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) throw new Error("A IA retornou resposta vazia para a análise visual.");
  return parseAiJson(raw);
}

function cleanField(value: string | null | undefined, maxLen: number): string | null {
  if (!value) return null;
  const trimmed = value
    .replace(/\s+/g, " ")
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1).trim()}…`;
}

function composeTitle(extraction: TitleExtraction, fileName: string): string {
  const tipo = cleanField(extraction.tipo_documento, MAX_TIPO_LEN);
  const entidade = cleanField(extraction.entidade_principal, MAX_ENTIDADE_LEN);
  const data = formatDataReferencia(extraction.data_referencia ?? null);

  const parts = [tipo, entidade, data].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  if (parts.length === 0) {
    return cleanFileNameAsTitle(fileName);
  }
  let title = parts.join(" — ");
  if (title.length > MAX_TITLE_LEN) {
    title = `${title.slice(0, MAX_TITLE_LEN - 1).trim()}…`;
  }
  return title;
}

/**
 * Suggest an objective, modular PT-BR title for a document.
 *
 * - PDF/text files are analyzed with AI ("Tipo — Entidade — Data"), falling back
 *   to vision for scanned PDFs without a text layer.
 * - Unsupported types (office/zip/images) skip AI and return a cleaned filename.
 *
 * Throws only when an AI call genuinely fails for a supported type; callers
 * should catch and fall back to {@link cleanFileNameAsTitle}.
 */
export async function suggestDocumentTitle(
  fileBuffer: Buffer,
  mimeType: string | null | undefined,
  fileName: string,
): Promise<SuggestTitleResult> {
  if (!isTitleSuggestableMimeType(mimeType)) {
    return { title: cleanFileNameAsTitle(fileName), source: "filename" };
  }

  let extraction: TitleExtraction;
  try {
    const fullText = await extractText(fileBuffer, mimeType);
    extraction = await extractFromText(fullText);
  } catch (err) {
    if (err instanceof EmptyDocumentError && mimeType === "application/pdf") {
      extraction = await extractFromImages(fileBuffer);
    } else {
      throw err;
    }
  }

  return { title: composeTitle(extraction, fileName), source: "ai" };
}

export { cleanFileNameAsTitle };
