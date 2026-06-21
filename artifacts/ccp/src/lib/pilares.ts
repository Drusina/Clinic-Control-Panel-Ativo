/**
 * Shared pillar metadata for the 8 diagnostic pillars. Centralised here so the
 * diagnostic comparison, the manager portal dashboard, risks and reports all
 * render the same labels, abbreviations and colors. Keep this as the single
 * source of truth — do not redefine pillar maps locally.
 */
export interface PilarInfo {
  nome: string;
  short: string;
  color: string;
}

export const PILAR_INFO: Record<string, PilarInfo> = {
  estrategia: { nome: "Estratégia e Governança", short: "Estratégia", color: "#6366f1" },
  financeiro: { nome: "Financeiro e Fluxo de Caixa", short: "Financeiro", color: "#10b981" },
  contabil: { nome: "Contabilidade e Fiscal", short: "Contábil", color: "#f59e0b" },
  marketing: { nome: "Vendas e Marketing", short: "Marketing", color: "#f43f5e" },
  operacoes: { nome: "Processos Operacionais", short: "Operações", color: "#06b6d4" },
  pessoas: { nome: "Gestão de Pessoas", short: "Pessoas", color: "#8b5cf6" },
  tecnologia: { nome: "Tecnologia e Sistemas", short: "Tecnologia", color: "#0ea5e9" },
  compliance: { nome: "Conformidade e LGPD", short: "Compliance", color: "#64748b" },
};

export const PILAR_ORDER: string[] = [
  "estrategia",
  "financeiro",
  "contabil",
  "marketing",
  "operacoes",
  "pessoas",
  "tecnologia",
  "compliance",
];

/** Human label for a pillar slug, falling back to the raw slug. */
export function pilarNome(slug: string | null | undefined): string {
  if (!slug) return "Geral";
  return PILAR_INFO[slug]?.nome ?? slug;
}

/** Short label for a pillar slug, falling back to the raw slug. */
export function pilarShort(slug: string | null | undefined): string {
  if (!slug) return "Geral";
  return PILAR_INFO[slug]?.short ?? slug;
}
