import OpenAI from "openai";
import { z } from "zod/v4";
import {
  EmptyDocumentError,
  PdfExtractionError,
  UnsupportedFileTypeError,
} from "./aiSummarizer.js";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const MAX_INPUT_CHARS = 24_000;
const MAX_OUTPUT_TOKENS = 2_000;
const MODEL = "gpt-5-mini";
const REASONING_EFFORT = "minimal" as const;

const SYSTEM_PROMPT = `Você é um analista jurídico especializado em societário brasileiro. \
A partir do texto de um documento societário (contrato social, alteração contratual, \
acordo de sócios), extraia informações estruturadas em JSON. NUNCA invente dados — \
se um campo não estiver no documento, devolva null. Não use markdown, devolva apenas JSON.`;

const USER_INSTRUCTIONS = `Identifique:
1. tipo do documento (contrato_social | alteracao | acordo_socios | outro)
2. resumo executivo de 2-4 frases em PT-BR
3. capital social total em R$ (apenas número, sem moeda)
4. lista de sócios atuais com: nome completo, CPF (se houver), percentual de quotas, \
valor das quotas em R$ (apenas número), qualificação (ex: "Sócio Administrador").

Devolva APENAS este JSON:
{
  "tipo_detectado": "contrato_social" | "alteracao" | "acordo_socios" | "outro",
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
  resumo: z.string().default(""),
  capital_social: z.number().nullable().optional(),
  socios: z.array(SocioExtractedSchema).default([]),
});

export type SocietaryExtraction = z.infer<typeof ExtractionSchema>;

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
        "Não foi possível extrair texto do PDF. Pode estar corrompido ou conter apenas imagens.",
      );
    }
    const text = (parsed.text ?? "").trim();
    if (!text) {
      throw new EmptyDocumentError(
        "Este PDF não contém texto extraível (provavelmente apenas imagens). Para esses casos, ainda não geramos sugestões.",
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

export async function extractSocietary(
  fileBuffer: Buffer,
  mimeType: string | null | undefined,
): Promise<{ extraction: SocietaryExtraction; truncated: boolean }> {
  const fullText = await extractTextLocal(fileBuffer, mimeType);
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
  return { extraction: safe.data, truncated };
}

export function isExtractableMimeType(mime: string | null | undefined): boolean {
  if (!mime) return false;
  if (mime === "application/pdf") return true;
  if (mime.startsWith("text/")) return true;
  return false;
}
