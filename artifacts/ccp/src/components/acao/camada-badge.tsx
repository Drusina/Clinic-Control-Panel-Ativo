import { Target, Layers, Building2, ShieldAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Camada de geração da ação (derivada do score médio do pilar no servidor):
 *  - pontual    (> 3,5): 1 resposta crítica isolada → 1 ação direta.
 *  - consolidada (2,5–3,5): respostas correlacionadas → 1 ação com subtarefas.
 *  - estrutural  (< 2,5): card-mãe com fases sequenciadas e cadeados.
 * Ações legadas/manuais têm camada nula → etiqueta neutra (não renderizada).
 */
export const CAMADA_CONFIG: Record<
  string,
  { label: string; Icon: LucideIcon; className: string; descricao: string }
> = {
  pontual: {
    label: "Pontual",
    Icon: Target,
    className: "bg-blue-100 text-blue-700",
    descricao:
      "Ação direta para uma resposta crítica isolada (pilar com bom desempenho).",
  },
  consolidada: {
    label: "Consolidada",
    Icon: Layers,
    className: "bg-purple-100 text-purple-700",
    descricao:
      "Ação única que agrupa respostas fracas correlacionadas em subtarefas com origem.",
  },
  estrutural: {
    label: "Estrutural",
    Icon: Building2,
    className: "bg-rose-100 text-rose-700",
    descricao:
      "Card-mãe com fases sequenciadas e cadeados de dependência (pilar crítico).",
  },
};

/** Compact camada tag with a Lucide icon. Renders nothing for null/unknown camada. */
export function CamadaBadge({
  camada,
  className,
}: {
  camada: string | null | undefined;
  className?: string;
}) {
  if (!camada) return null;
  const cfg = CAMADA_CONFIG[camada];
  if (!cfg) return null;
  const { label, Icon, className: cls } = cfg;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded font-medium",
        cls,
        className,
      )}
      title={cfg.descricao}
      data-testid={`acao-camada-${camada}`}
    >
      <Icon className="h-2.5 w-2.5" /> {label}
    </span>
  );
}

export type SeverityMeta = {
  /** Tailwind class for the card's top border color. */
  border: string;
  /** Tailwind classes for the SEV badge background/text. */
  badge: string;
  /** Human label (Crítico / Atenção / Baixo). */
  label: string;
};

/**
 * Severity color mapping from a linked risk's severidade (P×I):
 *  ≥15 → vermelho (crítico), 7–14 → amarelo (atenção), ≤6 → verde (baixo).
 */
export function severityMeta(severidade: number): SeverityMeta {
  if (severidade >= 15) {
    return { border: "bg-red-500", badge: "bg-red-100 text-red-700", label: "Crítico" };
  }
  if (severidade >= 7) {
    return {
      border: "bg-amber-500",
      badge: "bg-amber-100 text-amber-700",
      label: "Atenção",
    };
  }
  return {
    border: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-700",
    label: "Baixo",
  };
}

/** Compact SEV badge: "SEV {sev} · P×I". Renders nothing when severidade is null. */
export function SeverityBadge({
  severidade,
  probabilidade,
  impacto,
  className,
}: {
  severidade: number | null | undefined;
  probabilidade?: number | null;
  impacto?: number | null;
  className?: string;
}) {
  if (severidade == null) return null;
  const meta = severityMeta(severidade);
  const pi =
    probabilidade != null && impacto != null ? ` · P${probabilidade}×I${impacto}` : "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded font-medium",
        meta.badge,
        className,
      )}
      title={`Severidade do risco vinculado: ${severidade} (${meta.label})`}
      data-testid="acao-severidade"
    >
      <ShieldAlert className="h-2.5 w-2.5" /> SEV {severidade}
      {pi}
    </span>
  );
}
