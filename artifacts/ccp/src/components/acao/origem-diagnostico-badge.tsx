import { Activity } from "lucide-react";
import type { OrigemDiagnostico } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

/** Format a 0–5 score in pt-BR with one decimal (e.g. 2.4 → "2,4"). */
export function formatScore(n: number): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** Short pillar label for the compact card indicator (first word of the name). */
export function shortPilar(pilarNome: string): string {
  return pilarNome.split(" ")[0];
}

/**
 * Compact "diagnostic origin" indicator shown on Plano de Ação cards: the action's
 * pillar plus its score in the clinic's latest concluded diagnostic. Subtly amber
 * when the pillar is below its meta.
 */
export default function OrigemDiagnosticoBadge({
  origem,
  className,
}: {
  origem: OrigemDiagnostico;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      title={`Origem no diagnóstico — ${origem.pilarNome}: ${formatScore(origem.score)}/5 (meta ${formatScore(origem.meta)})`}
      data-testid={`acao-origem-${origem.pilarSlug}`}
    >
      <Activity className="h-3 w-3 shrink-0" />
      <span className={cn("truncate", origem.abaixoDaMeta && "text-amber-600 font-medium")}>
        {shortPilar(origem.pilarNome)} · {formatScore(origem.score)}/5
      </span>
    </div>
  );
}
