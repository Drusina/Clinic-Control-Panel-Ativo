import type { Clinic, CondicoesComerciaisSnapshot } from "@workspace/api-client-react";

export const FORMA_PAGAMENTO_OPTIONS = [
  { value: "boleto", label: "Boleto Bancário" },
  { value: "pix", label: "PIX" },
  { value: "cartao", label: "Cartão de Crédito" },
  { value: "transferencia", label: "Transferência Bancária" },
];

export const REAJUSTE_OPTIONS = [
  { value: "IGPM/FGV", label: "IGPM/FGV" },
  { value: "IPCA/IBGE", label: "IPCA/IBGE" },
  { value: "INPC/IBGE", label: "INPC/IBGE" },
  { value: "fixo", label: "Fixo (sem reajuste)" },
];

export const FATURA_STATUS_OPTIONS = [
  { value: "aberta", label: "Aberta" },
  { value: "enviada", label: "Enviada" },
  { value: "paga", label: "Paga" },
  { value: "vencida", label: "Vencida" },
  { value: "cancelada", label: "Cancelada" },
] as const;

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function getFaturaStatusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "paga":
      return "default";
    case "vencida":
      return "destructive";
    case "cancelada":
      return "outline";
    case "enviada":
    case "aberta":
    default:
      return "secondary";
  }
}

/** Extracts the current commercial conditions of a clinic into snapshot shape. */
export function clinicToSnapshot(clinic: Clinic): CondicoesComerciaisSnapshot {
  return {
    valorImplantacao: clinic.valorImplantacao ?? null,
    valorRecorrente: clinic.valorRecorrente ?? null,
    formaPagamento: clinic.formaPagamento ?? null,
    diaVencimento: clinic.diaVencimento ?? null,
    reajusteIndice: clinic.reajusteIndice ?? null,
    inicioRecorrencia: clinic.inicioRecorrencia ?? null,
    prazoContratoMeses: clinic.prazoContratoMeses ?? null,
    validadePropostaDias: clinic.validadePropostaDias ?? null,
    dataPrevistaInicio: clinic.dataPrevistaInicio ?? null,
    responsavelComercial: clinic.responsavelComercial ?? null,
    observacoesComerciais: clinic.observacoesComerciais ?? null,
    condicoesEspeciais: clinic.condicoesEspeciais ?? null,
  };
}

const SNAPSHOT_KEYS: (keyof CondicoesComerciaisSnapshot)[] = [
  "valorImplantacao",
  "valorRecorrente",
  "formaPagamento",
  "diaVencimento",
  "reajusteIndice",
  "inicioRecorrencia",
  "prazoContratoMeses",
  "validadePropostaDias",
  "dataPrevistaInicio",
  "responsavelComercial",
  "observacoesComerciais",
  "condicoesEspeciais",
];

function norm(v: unknown): string {
  if (v == null || v === "") return "";
  return String(v);
}

/**
 * True when the live clinic conditions diverge from a document's frozen
 * snapshot — used to warn that a generated document is out of date.
 */
export function conditionsDiffer(
  current: CondicoesComerciaisSnapshot,
  snapshot: CondicoesComerciaisSnapshot,
): boolean {
  return SNAPSHOT_KEYS.some((k) => norm(current[k]) !== norm(snapshot[k]));
}

/** Best-effort extraction of a server error message from an API error. */
export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === "object" && "error" in data) {
      const e = (data as { error?: unknown }).error;
      if (typeof e === "string" && e.trim() !== "") return e;
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
