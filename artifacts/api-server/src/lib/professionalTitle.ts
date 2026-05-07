const TIPO_LABEL_MAP: Record<string, string> = {
  contrato_social: "Contrato Social",
  alteracao: "Alteração Contratual",
  acordo_socios: "Acordo de Sócios",
  outro: "Documento Societário",
};

const MAX_RAZAO_LEN = 60;
const MAX_TITLE_LEN = 140;

function tipoLabel(tipo: string | null | undefined): string {
  if (!tipo) return TIPO_LABEL_MAP.outro;
  return TIPO_LABEL_MAP[tipo] ?? TIPO_LABEL_MAP.outro;
}

function titleCasePreservingAcronyms(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+|[-/])/)
    .map((part) => {
      if (/^\s+$/.test(part) || part === "-" || part === "/") return part;
      if (part.length === 0) return part;
      if (/^(de|da|do|das|dos|e|em|para|por|a|o)$/i.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("")
    .replace(/\b(ltda|s\.?a\.?|me|epp|eireli)\b/gi, (m) => m.toUpperCase());
}

function cleanRazaoSocial(razao: string | null | undefined): string | null {
  if (!razao) return null;
  const trimmed = razao
    .replace(/\s+/g, " ")
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .trim();
  if (trimmed.length === 0) return null;
  const cased = titleCasePreservingAcronyms(trimmed);
  if (cased.length <= MAX_RAZAO_LEN) return cased;
  return `${cased.slice(0, MAX_RAZAO_LEN - 1).trim()}…`;
}

function cleanFileNameAsTitle(fileName: string | null | undefined): string {
  if (!fileName) return "Documento";
  const noExt = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const stripped = noExt
    // remove leading numeric/order prefixes like "03 - " or "01_"
    .replace(/^[\s\d._\-–—()]+/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length === 0) return noExt.trim() || "Documento";
  return titleCasePreservingAcronyms(stripped);
}

function formatDataReferencia(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // ISO date: YYYY-MM-DD or YYYY-MM
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const month = m.padStart(2, "0");
    if (d) return `${d.padStart(2, "0")}/${month}/${y}`;
    return `${month}/${y}`;
  }

  // BR date: DD/MM/YYYY
  const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
  }

  // BR month/year
  const monthYear = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (monthYear) {
    const [, m, y] = monthYear;
    return `${m.padStart(2, "0")}/${y}`;
  }

  // Year only
  const yearOnly = trimmed.match(/^(\d{4})$/);
  if (yearOnly) return yearOnly[1];

  return null;
}

export interface BuildTitleInput {
  tipo: string | null | undefined;
  razaoSocial?: string | null;
  dataReferencia?: string | null;
  fallbackFileName?: string | null;
}

/**
 * Build a professional title for a societary document.
 * Examples:
 *  - "Alteração Contratual — Milenio Serviços — 01/2016"
 *  - "Contrato Social — Acme LTDA"
 *  - falls back to a cleaned filename when no AI data is available.
 */
export function buildProfessionalTitle(input: BuildTitleInput): string {
  const label = tipoLabel(input.tipo);
  const razao = cleanRazaoSocial(input.razaoSocial ?? null);
  const date = formatDataReferencia(input.dataReferencia ?? null);

  const parts: string[] = [label];
  if (razao) parts.push(razao);
  if (date) parts.push(date);

  let title: string;
  if (parts.length >= 2) {
    title = parts.join(" — ");
  } else {
    const fallback = cleanFileNameAsTitle(input.fallbackFileName ?? null);
    title = `${label} — ${fallback}`;
  }

  if (title.length > MAX_TITLE_LEN) {
    title = `${title.slice(0, MAX_TITLE_LEN - 1).trim()}…`;
  }
  return title;
}
