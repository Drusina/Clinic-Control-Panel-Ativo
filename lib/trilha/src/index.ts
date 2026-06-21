/**
 * @workspace/trilha — canonical, zero-dependency definition of the fixed
 * 15-stage clinic implementation journey ("Trilha de Implementação").
 *
 * This is intentionally a standalone workspace lib (no DB, no Drizzle, no Zod)
 * so it can be imported by the API server, the web frontend, and downstream
 * features (e.g. the per-clinic Agenda) without coupling any of them to the
 * database layer. The 15 stages are a CODE CONSTANT (decided: the trilha is
 * fixed and identical for every clinic) — they are never stored as a template
 * table.
 */

/** Per-clinic lifecycle state of a single trilha stage. */
export type TrilhaEtapaStatus =
  | "pendente"
  | "em_andamento"
  | "concluido"
  | "bloqueado"
  | "nao_aplicavel";

export const TRILHA_ETAPA_STATUSES: readonly TrilhaEtapaStatus[] = [
  "pendente",
  "em_andamento",
  "concluido",
  "bloqueado",
  "nao_aplicavel",
] as const;

/**
 * A stage counts toward `progresso` when it is resolved — i.e. explicitly
 * concluded OR explicitly marked "não se aplica". A blocked or pending stage
 * is NOT progress.
 */
export function isResolvedStatus(status: TrilhaEtapaStatus): boolean {
  return status === "concluido" || status === "nao_aplicavel";
}

/**
 * Semantic identifier of the module that executes a stage. The frontend maps
 * this to the correct URL per context (super-admin clinic-detail tabs vs.
 * gestor portal routes). `null` means the stage is a manual-only marco with no
 * backing module.
 */
export type TrilhaModulo =
  | "cadastro"
  | "financeiro"
  | "documentos"
  | "lgpd"
  | "kickoff"
  | "diagnostico"
  | "riscos"
  | "plano_acao"
  | "painel"
  | null;

export interface TrilhaEtapaDef {
  /** Stable key persisted per clinic (never change once shipped). */
  readonly key: string;
  /** 1-based position in the journey. */
  readonly ordem: number;
  /** Short human label shown in the stepper. */
  readonly titulo: string;
  /** One-line description of what the stage represents. */
  readonly descricao: string;
  /** Module that executes the stage (frontend resolves to a URL), or null. */
  readonly modulo: TrilhaModulo;
  /**
   * True when the stage has no derivation signal in existing data and can only
   * be advanced by an explicit human confirmation (a NEW marco). The system
   * never auto-suggests completion for these.
   */
  readonly manual: boolean;
}

/**
 * The fixed 15-stage journey, in order. Keys are stable persistence
 * identifiers — do not rename. Order is 1..15.
 */
export const TRILHA_ETAPAS: readonly TrilhaEtapaDef[] = [
  {
    key: "pre_cadastro",
    ordem: 1,
    titulo: "Pré-Cadastro",
    descricao: "Clínica cadastrada na plataforma.",
    modulo: "cadastro",
    manual: false,
  },
  {
    key: "proposta",
    ordem: 2,
    titulo: "Proposta",
    descricao: "Proposta comercial enviada.",
    modulo: "financeiro",
    manual: false,
  },
  {
    key: "contrato",
    ordem: 3,
    titulo: "Assinatura de Contrato",
    descricao: "Contrato anexado e assinado.",
    modulo: "financeiro",
    manual: false,
  },
  {
    key: "docs_constitutivos",
    ordem: 4,
    titulo: "Documentos Constitutivos",
    descricao: "Cadastro com documentos constitutivos enviados.",
    modulo: "documentos",
    manual: false,
  },
  {
    key: "lgpd",
    ordem: 5,
    titulo: "Assinatura LGPD",
    descricao: "Termos LGPD e autorizações assinados.",
    modulo: "lgpd",
    manual: false,
  },
  {
    key: "kickoff",
    ordem: 6,
    titulo: "Kick-off",
    descricao: "Kick-off realizado: equipe interna, rede externa e sistemas.",
    modulo: "kickoff",
    manual: false,
  },
  {
    key: "envio_diagnostico",
    ordem: 7,
    titulo: "Envio de Diagnóstico",
    descricao: "Links/delegações de diagnóstico enviados.",
    modulo: "diagnostico",
    manual: false,
  },
  {
    key: "recebimento_diagnostico",
    ordem: 8,
    titulo: "Recebimento de Diagnóstico",
    descricao: "Diagnóstico concluído com respostas.",
    modulo: "diagnostico",
    manual: false,
  },
  {
    key: "mapa_riscos",
    ordem: 9,
    titulo: "Mapa de Riscos",
    descricao: "Riscos cadastrados ou gerados.",
    modulo: "riscos",
    manual: false,
  },
  {
    key: "plano_acao",
    ordem: 10,
    titulo: "Plano de Ação",
    descricao: "Ações cadastradas no plano de ação.",
    modulo: "plano_acao",
    manual: false,
  },
  {
    key: "avaliacao",
    ordem: 11,
    titulo: "Avaliação e Validação",
    descricao: "Marco de validação e sign-off (confirmação manual).",
    modulo: null,
    manual: true,
  },
  {
    key: "montagem_painel",
    ordem: 12,
    titulo: "Montagem do Painel",
    descricao: "Preparação do painel de gestão (confirmação manual).",
    modulo: null,
    manual: true,
  },
  {
    key: "painel_gestao",
    ordem: 13,
    titulo: "Painel de Gestão",
    descricao: "Gestor com acesso ativo ao portal.",
    modulo: "painel",
    manual: false,
  },
  {
    key: "treinamento",
    ordem: 14,
    titulo: "Treinamento",
    descricao: "Marco de treinamento (confirmação manual).",
    modulo: null,
    manual: true,
  },
  {
    key: "acompanhamento",
    ordem: 15,
    titulo: "Acompanhamento",
    descricao: "Fase recorrente contínua (confirmação manual).",
    modulo: null,
    manual: true,
  },
] as const;

/** Total number of stages in the journey. */
export const TRILHA_TOTAL = TRILHA_ETAPAS.length;

/** Ordered list of stage keys. */
export const TRILHA_ETAPA_KEYS: readonly string[] = TRILHA_ETAPAS.map(
  (e) => e.key,
);

const ETAPA_BY_KEY = new Map<string, TrilhaEtapaDef>(
  TRILHA_ETAPAS.map((e) => [e.key, e]),
);

/** Look up a stage definition by key, or undefined when unknown. */
export function getTrilhaEtapa(key: string): TrilhaEtapaDef | undefined {
  return ETAPA_BY_KEY.get(key);
}

/** True when `key` is one of the canonical stage keys. */
export function isTrilhaEtapaKey(key: string): boolean {
  return ETAPA_BY_KEY.has(key);
}

/**
 * Compute the derived clinic-level summary from the resolved status of each
 * stage. `progresso` is the percentage of resolved stages (concluído + não se
 * aplica) over the total; `etapa` is the 1-based order of the first
 * non-resolved stage (the current active step), capped at the total when the
 * whole journey is resolved.
 */
export function computeTrilhaSummary(
  statusesByKey: Readonly<Record<string, TrilhaEtapaStatus>>,
): { etapa: number; progresso: number; resolvidas: number; total: number } {
  let resolvidas = 0;
  let firstUnresolved = 0;
  for (const def of TRILHA_ETAPAS) {
    const status = statusesByKey[def.key] ?? "pendente";
    if (isResolvedStatus(status)) {
      resolvidas += 1;
    } else if (firstUnresolved === 0) {
      firstUnresolved = def.ordem;
    }
  }
  const etapa = firstUnresolved === 0 ? TRILHA_TOTAL : firstUnresolved;
  const progresso = Math.round((resolvidas / TRILHA_TOTAL) * 100);
  return { etapa, progresso, resolvidas, total: TRILHA_TOTAL };
}
