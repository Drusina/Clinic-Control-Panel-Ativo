import OpenAI from "openai";
import { z } from "zod/v4";
import {
  EmptyDocumentError,
  PdfExtractionError,
  UnsupportedFileTypeError,
} from "./aiSummarizer.js";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import {
  renderPdfPagesToImages,
  DEFAULT_MAX_VISION_PAGES,
} from "./pdfRender.js";

const MAX_INPUT_CHARS = 24_000;
const MAX_OUTPUT_TOKENS = 2_000;
const MODEL = "gpt-5-mini";
const REASONING_EFFORT = "minimal" as const;

const SYSTEM_PROMPT = `Você é um analista jurídico especializado em societário brasileiro. \
A partir do conteúdo de um documento societário (contrato social, alteração contratual, \
acordo de sócios), extraia informações estruturadas em JSON. NUNCA invente dados — \
se um campo não estiver no documento, devolva null. Não use markdown, devolva apenas JSON.`;

const USER_INSTRUCTIONS = `Identifique:
1. tipo do documento (contrato_social | alteracao | acordo_socios | outro). \
Regras de classificação (ordem de precedência):
   - "alteracao" → o documento contém termos como "ALTERAÇÃO CONTRATUAL", \
"INSTRUMENTO PARTICULAR DE ALTERAÇÃO", "ADITIVO", "CONSOLIDAÇÃO DA ALTERAÇÃO", \
ou faz referência a um Contrato Social anterior que está sendo modificado;
   - "contrato_social" → APENAS o ato constitutivo original ("CONTRATO SOCIAL", \
"CONSTITUIÇÃO DA SOCIEDADE") sem menção a alteração de contrato anterior;
   - "acordo_socios" → "ACORDO DE SÓCIOS" / "SHAREHOLDERS AGREEMENT";
   - "outro" → quando não se encaixa nas categorias acima.
2. número da alteração (apenas quando tipo=alteracao): número ordinal mencionado \
no documento — ex: "5ª", "QUINTA", "5ª alteração contratual", "consolidação da 5ª". \
Devolva como inteiro (1, 2, 3...) ou null se não estiver explícito.
3. razão social/nome empresarial da pessoa jurídica (preferindo a denominação completa)
4. data de referência do documento — preferencialmente a data de assinatura ou registro \
(formato ISO YYYY-MM-DD ou YYYY-MM se só houver mês/ano)
5. resumo executivo de 2-4 frases em PT-BR
6. capital social total em R$ APÓS esta alteração/contrato (apenas número, sem moeda)
7. lista de sócios atuais APÓS esta alteração/contrato (NÃO inclua sócios que se \
retiraram nesta alteração — só os que permanecem no quadro): nome completo, CPF \
(se houver), percentual de quotas, valor das quotas em R$ (apenas número), \
qualificação (ex: "Sócio Administrador").

Devolva APENAS este JSON:
{
  "tipo_detectado": "contrato_social" | "alteracao" | "acordo_socios" | "outro",
  "numero_alteracao": number | null,
  "razao_social": "string" | null,
  "data_referencia": "string" | null,
  "resumo": "string",
  "capital_social": number | null,
  "socios": [
    {
      "nome": "string",
      "cpf": "string" | null,
      "percentual": number | null,
      "valor_quotas": number | null,
      "qualificacao": "string" | null
    }
  ]
}`;

const SocioExtractedSchema = z.object({
  nome: z.string().min(1),
  cpf: z.string().nullable().optional(),
  percentual: z.number().nullable().optional(),
  valor_quotas: z.number().nullable().optional(),
  qualificacao: z.string().nullable().optional(),
});

const ExtractionSchema = z.object({
  tipo_detectado: z
    .enum(["contrato_social", "alteracao", "acordo_socios", "outro"])
    .default("outro"),
  numero_alteracao: z.number().int().positive().nullable().optional(),
  razao_social: z.string().nullable().optional(),
  data_referencia: z.string().nullable().optional(),
  resumo: z.string().default(""),
  capital_social: z.number().nullable().optional(),
  socios: z.array(SocioExtractedSchema).default([]),
});

export type SocietaryExtraction = z.infer<typeof ExtractionSchema>;

export type AnalysisMode = "text" | "vision";

export interface ExtractSocietaryResult {
  extraction: SocietaryExtraction;
  truncated: boolean;
  analysisMode: AnalysisMode;
  pagesAnalyzed: number;
  totalPages: number;
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

async function extractTextLocal(
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

function parseAiJson(raw: string): SocietaryExtraction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("A IA retornou JSON inválido.");
  }
  const safe = ExtractionSchema.safeParse(parsed);
  if (!safe.success) {
    throw new Error("A IA retornou um JSON em formato inesperado.");
  }
  return safe.data;
}

async function extractFromText(
  fullText: string,
): Promise<{ extraction: SocietaryExtraction; truncated: boolean }> {
  const truncated = fullText.length > MAX_INPUT_CHARS;
  const text = truncated ? fullText.slice(0, MAX_INPUT_CHARS) : fullText;

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
          content:
            USER_INSTRUCTIONS +
            (truncated
              ? "\n\nATENÇÃO: o texto abaixo foi truncado para análise.\n\n"
              : "\n\n") +
            text,
        },
      ],
    });
  } catch (err) {
    throw new Error(`Falha ao chamar IA: ${(err as Error).message}`);
  }

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) throw new Error("A IA retornou resposta vazia.");
  return { extraction: parseAiJson(raw), truncated };
}

async function extractFromImages(
  fileBuffer: Buffer,
): Promise<{
  extraction: SocietaryExtraction;
  truncated: boolean;
  pagesAnalyzed: number;
  totalPages: number;
}> {
  const { pages, totalPages, truncated } = await renderPdfPagesToImages(
    fileBuffer,
    { maxPages: DEFAULT_MAX_VISION_PAGES },
  );

  const noteIfTruncated = truncated
    ? `\n\nATENÇÃO: este PDF tem ${totalPages} páginas; só as primeiras ${pages.length} foram enviadas para análise.\n\n`
    : "\n\n";

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
                USER_INSTRUCTIONS +
                noteIfTruncated +
                "As imagens a seguir são páginas de um PDF escaneado (sem camada de texto). Leia o conteúdo das imagens — incluindo carimbos, assinaturas e textos manuscritos quando legíveis — e devolva o JSON solicitado.",
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
  return {
    extraction: parseAiJson(raw),
    truncated,
    pagesAnalyzed: pages.length,
    totalPages,
  };
}

export async function extractSocietary(
  fileBuffer: Buffer,
  mimeType: string | null | undefined,
): Promise<ExtractSocietaryResult> {
  let textResult: { extraction: SocietaryExtraction; truncated: boolean } | null =
    null;
  let textErr: unknown = null;
  try {
    const fullText = await extractTextLocal(fileBuffer, mimeType);
    textResult = await extractFromText(fullText);
  } catch (err) {
    textErr = err;
  }

  if (textResult) {
    return {
      extraction: textResult.extraction,
      truncated: textResult.truncated,
      analysisMode: "text",
      pagesAnalyzed: 0,
      totalPages: 0,
    };
  }

  // Fallback to vision only for PDFs that are scanned (no text layer).
  if (textErr instanceof EmptyDocumentError && mimeType === "application/pdf") {
    const vision = await extractFromImages(fileBuffer);
    return {
      extraction: vision.extraction,
      truncated: vision.truncated,
      analysisMode: "vision",
      pagesAnalyzed: vision.pagesAnalyzed,
      totalPages: vision.totalPages,
    };
  }

  throw textErr instanceof Error ? textErr : new Error(String(textErr));
}

export function isExtractableMimeType(mime: string | null | undefined): boolean {
  if (!mime) return false;
  if (mime === "application/pdf") return true;
  if (mime.startsWith("text/")) return true;
  return false;
}
