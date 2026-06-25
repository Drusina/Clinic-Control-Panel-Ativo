import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useGetClinic,
  getGetClinicQueryKey,
  useListRisks,
  getListRisksQueryKey,
  useListActions,
  getListActionsQueryKey,
  useListDiagnostics,
  getListDiagnosticsQueryKey,
  useListClinicTarefas,
  getListClinicTarefasQueryKey,
  type Action,
  type Risk,
  type Diagnostic,
  type ClinicTarefa,
  type ListClinicTarefasParams,
} from "@workspace/api-client-react";
import { useMyClinics, MY_CLINICS_QUERY_KEY } from "@/hooks/use-auth";
import { TrilhaStepper } from "@/components/trilha/trilha-stepper";
import { ClinicLogo } from "@/components/clinic-logo";
import { EmptyState } from "@/components/empty-state";
import { pilarShort } from "@/lib/pilares";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Building2,
  MapPin,
  CalendarDays,
  Users,
  KeyRound,
  Stethoscope,
  ShieldAlert,
  ListChecks,
  ListTodo,
  Workflow,
  FileText,
  Paperclip,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  LayoutGrid,
} from "lucide-react";

type IconType = typeof LayoutGrid;
type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const RISK_OPEN_STATUS = new Set(["identificado", "aceito", "em_mitigacao"]);
const RISK_HIGH_SEVERIDADE = 14; // severidade > 14 ⇒ nível "alto"

interface HubIndicators {
  maturidade: number | null;
  riscosCriticos: number;
  acoesAbertas: number;
}

interface ModuleDef {
  secao: string;
  title: string;
  description: string;
  icon: IconType;
  indicator?: (ind: HubIndicators) => string | null;
}

interface ModuleGroup {
  label: string;
  modules: ModuleDef[];
}

const MODULE_GROUPS: ModuleGroup[] = [
  {
    label: "Onboarding",
    modules: [
      {
        secao: "agenda",
        title: "Agenda",
        description: "Reuniões, tarefas e marcos com lembretes",
        icon: CalendarDays,
      },
      {
        secao: "equipe",
        title: "Equipe Interna",
        description: "Membros e permissões",
        icon: Users,
      },
      {
        secao: "rede-externa",
        title: "Rede Externa",
        description: "Parceiros e fornecedores",
        icon: Building2,
      },
      {
        secao: "sistemas-acessos",
        title: "Sistemas e Acessos",
        description: "Credenciais e softwares",
        icon: KeyRound,
      },
    ],
  },
  {
    label: "Operação",
    modules: [
      {
        secao: "diagnostico",
        title: "Diagnóstico 360°",
        description: "Avaliação de maturidade da clínica",
        icon: Stethoscope,
        indicator: (i) =>
          i.maturidade != null ? `${i.maturidade.toFixed(1)}/5` : null,
      },
      {
        secao: "riscos",
        title: "Mapa de Riscos",
        description: "Riscos identificados e prioridades",
        icon: ShieldAlert,
        indicator: (i) =>
          i.riscosCriticos > 0 ? `${i.riscosCriticos} críticos` : null,
      },
      {
        secao: "acao",
        title: "Plano de Ação",
        description: "Kanban de ações e tarefas",
        icon: ListChecks,
        indicator: (i) =>
          i.acoesAbertas > 0 ? `${i.acoesAbertas} abertas` : null,
      },
      {
        secao: "processos",
        title: "Processos",
        description: "Fluxos e POPs da operação",
        icon: Workflow,
      },
    ],
  },
  {
    label: "Documentação",
    modules: [
      {
        secao: "documentos",
        title: "Documentos",
        description: "Gestão de documentos gerais",
        icon: FileText,
      },
      {
        secao: "evidencias",
        title: "Evidências",
        description: "Anexos e comprovantes por pilar",
        icon: Paperclip,
      },
    ],
  },
];

const PORTAL_MODULE_SECOES: Record<string, { secao: string; label: string }> = {
  documentos: { secao: "documentos", label: "Abrir Documentos" },
  kickoff: { secao: "kickoff", label: "Abrir Kickoff" },
  diagnostico: { secao: "diagnostico", label: "Abrir Diagnóstico" },
  riscos: { secao: "riscos", label: "Abrir Mapa de Riscos" },
  plano_acao: { secao: "acao", label: "Abrir Plano de Ação" },
};

const PLANO_STAGES = [
  { key: "a_fazer", label: "A fazer", dot: "bg-muted-foreground/40" },
  { key: "em_andamento", label: "Em andamento", dot: "bg-blue-500" },
  { key: "revisao", label: "Em revisão", dot: "bg-amber-500" },
  { key: "concluido", label: "Concluído", dot: "bg-emerald-500" },
] as const;

const TAREFA_STATUS_META: Record<
  ClinicTarefa["status"],
  { label: string; badge: BadgeVariant; dot: string }
> = {
  a_fazer: { label: "A fazer", badge: "outline", dot: "bg-muted-foreground/40" },
  fazendo: { label: "Em andamento", badge: "secondary", dot: "bg-blue-500" },
  concluida: { label: "Concluído", badge: "default", dot: "bg-emerald-500" },
};

/** Coerce a possibly-unknown score value (scoreGlobal is typed loosely). */
function toNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Parse a `YYYY-MM-DD` (or ISO) prazo into a local date-only Date. */
function parsePrazo(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatPrazo(s: string | null | undefined): string {
  const d = parsePrazo(s);
  if (!d) return "Sem prazo";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function ModuleCard({
  clinicId,
  module,
  indicators,
}: {
  clinicId: string;
  module: ModuleDef;
  indicators: HubIndicators;
}) {
  const Icon = module.icon;
  const indicator = module.indicator ? module.indicator(indicators) : null;
  return (
    <Link
      href={`/portal/clinica/${clinicId}/${module.secao}`}
      className="group flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-md"
      data-testid={`module-card-${module.secao}`}
    >
      <div className="mb-4 flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-foreground transition-colors group-hover:text-primary">
          {module.title}
        </h3>
        {indicator && (
          <Badge variant="secondary" className="text-[11px] font-medium">
            {indicator}
          </Badge>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{module.description}</p>
    </Link>
  );
}

export default function PortalDashboard({ clinicId }: { clinicId: string }) {
  const { data: clinic } = useGetClinic(clinicId, {
    query: { enabled: !!clinicId, queryKey: getGetClinicQueryKey(clinicId) },
  });
  const { data: myClinics } = useMyClinics();
  const card = myClinics?.clinics.find((c) => c.id === clinicId) ?? null;

  const { data: risks } = useListRisks(clinicId, {
    query: { enabled: !!clinicId, queryKey: getListRisksQueryKey(clinicId) },
  });
  const { data: actions } = useListActions(
    clinicId,
    undefined,
    {
      query: {
        enabled: !!clinicId,
        queryKey: getListActionsQueryKey(clinicId),
      },
    },
  );
  const { data: diagnostics } = useListDiagnostics(clinicId, {
    query: {
      enabled: !!clinicId,
      queryKey: getListDiagnosticsQueryKey(clinicId),
    },
  });

  // ─── Tarefas (execution list) — "Equipe" vs "Minhas" ──────────────────────
  // The backend forces `mine` for team_member callers, so for managers both
  // scopes resolve to their own tasks; super_admin sees the full team list
  // under "Equipe". Default is "Equipe" per the home brief.
  const [taskScope, setTaskScope] = useState<"equipe" | "minhas">("equipe");
  const tarefaParams: ListClinicTarefasParams =
    taskScope === "minhas" ? { mine: true } : {};
  const { data: tarefas, isLoading: tarefasLoading } = useListClinicTarefas(
    clinicId,
    tarefaParams,
    {
      query: {
        enabled: !!clinicId,
        queryKey: getListClinicTarefasQueryKey(clinicId, tarefaParams),
      },
    },
  );

  const nome = clinic?.nome ?? card?.fantasia ?? card?.nome ?? "Clínica";
  const progresso = card?.progresso ?? 0;
  const etapa = card?.etapa ?? null;
  const status = clinic?.status ?? card?.status ?? null;
  const plano = clinic?.plano ?? card?.plano ?? null;

  // ─── Plano de Ação panorama (board-stage view, NOT a task list) ───────────
  const plano_acao = useMemo(() => {
    const list: Action[] = actions ?? [];
    const stage: Record<(typeof PLANO_STAGES)[number]["key"], number> = {
      a_fazer: 0,
      em_andamento: 0,
      revisao: 0,
      concluido: 0,
    };
    for (const a of list) {
      if (a.coluna === "backlog" || a.coluna === "todo") stage.a_fazer += 1;
      else if (a.coluna === "doing") stage.em_andamento += 1;
      else if (a.coluna === "review") stage.revisao += 1;
      else if (a.coluna === "done") stage.concluido += 1;
    }

    const open = list.filter((a) => a.coluna !== "done");
    const byPilar = new Map<string, number>();
    for (const a of open) {
      const key = a.pilarSlug ?? "__none__";
      byPilar.set(key, (byPilar.get(key) ?? 0) + 1);
    }
    const pilarBars = [...byPilar.entries()]
      .map(([slug, count]) => ({
        slug,
        count,
        label: slug === "__none__" ? "Sem pilar" : pilarShort(slug),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
    const maxPilar = pilarBars.reduce((m, p) => Math.max(m, p.count), 0);

    return { stage, openCount: open.length, pilarBars, maxPilar };
  }, [actions]);

  // ─── Hub indicators (derived from already-loaded clinic-scoped data) ───────
  const indicators = useMemo<HubIndicators>(() => {
    const diagList: Diagnostic[] = diagnostics ?? [];
    const concluded = diagList
      .filter((d) => d.status === "concluido")
      .sort((a, b) => b.versao - a.versao);
    const maturidade = concluded[0] ? toNum(concluded[0].scoreGlobal) : null;

    const riskList: Risk[] = risks ?? [];
    const riscosCriticos = riskList.filter(
      (r) =>
        RISK_OPEN_STATUS.has(r.status) &&
        (r.nivel === "alto" || r.severidade > RISK_HIGH_SEVERIDADE),
    ).length;

    return { maturidade, riscosCriticos, acoesAbertas: plano_acao.openCount };
  }, [diagnostics, risks, plano_acao.openCount]);

  // ─── Tarefas aggregation (status counters + ordered rows) ─────────────────
  const tarefaStats = useMemo(() => {
    const list: ClinicTarefa[] = tarefas ?? [];
    const counts: Record<ClinicTarefa["status"], number> = {
      a_fazer: 0,
      fazendo: 0,
      concluida: 0,
    };
    for (const t of list) counts[t.status] += 1;
    const rows = [...list]
      .sort((a, b) => {
        const ra = a.status === "concluida" ? 1 : 0;
        const rb = b.status === "concluida" ? 1 : 0;
        if (ra !== rb) return ra - rb;
        const pa = parsePrazo(a.prazo);
        const pb = parsePrazo(b.prazo);
        if (pa && pb) return pa.getTime() - pb.getTime();
        if (pa) return -1;
        if (pb) return 1;
        return 0;
      })
      .slice(0, 6);
    return { counts, rows };
  }, [tarefas]);

  const today = startOfToday();

  return (
    <div className="flex flex-col gap-6">
      {/* 1 ─ Clinic header */}
      <section className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 md:flex-row md:items-center">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
          <ClinicLogo
            clinicId={clinicId}
            logoUrl={clinic?.logoUrl ?? card?.logoUrl}
            name={nome}
            className="h-full w-full p-2"
            fallback={<Building2 className="h-8 w-8 text-muted-foreground" />}
          />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1
              className="text-2xl font-semibold tracking-tight text-foreground"
              data-testid="painel-clinic-name"
            >
              {nome}
            </h1>
            {status && (
              <Badge variant="outline" className="capitalize">
                {status}
              </Badge>
            )}
            {plano && (
              <Badge variant="secondary" className="capitalize">
                Plano {plano}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {clinic?.cnpj && (
              <span className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4" /> {clinic.cnpj}
              </span>
            )}
            {(clinic?.cidade || clinic?.uf) && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> {clinic?.cidade}
                {clinic?.uf ? `/${clinic.uf}` : ""}
              </span>
            )}
          </div>
        </div>

        <div
          className="flex w-full flex-col gap-2 rounded-lg border border-border bg-muted/40 p-4 md:w-[340px]"
          data-testid="painel-progresso"
        >
          <div className="flex items-center justify-between text-sm font-medium">
            <span className="text-foreground">
              {etapa ?? "Progresso da implantação"}
            </span>
            <span className="text-primary">{progresso}%</span>
          </div>
          <Progress value={progresso} className="h-2" />
        </div>
      </section>

      {/* 2 ─ Trilha de implementação (gold bar) */}
      <TrilhaStepper
        clinicId={clinicId}
        invalidateKeys={[MY_CLINICS_QUERY_KEY]}
        moduleNav={(modulo) => {
          if (!modulo) return null;
          const m = PORTAL_MODULE_SECOES[modulo];
          if (!m) return null;
          return {
            kind: "link",
            href: `/portal/clinica/${clinicId}/${m.secao}`,
            label: m.label,
          };
        }}
      />

      {/* 3 ─ Plano de Ação (panorama) + Tarefas (execução) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Plano de Ação — strategic panorama */}
        <Card data-testid="painel-plano-acao">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="h-4 w-4 text-primary" />
                Plano de Ação
              </CardTitle>
              <Link
                href={`/portal/clinica/${clinicId}/acao`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                data-testid="plano-ver-board"
              >
                Ver board
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {/* Stage counters */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {PLANO_STAGES.map((s) => (
                <div
                  key={s.key}
                  className="flex flex-col gap-1 rounded-lg border border-border bg-muted/20 px-3 py-2.5"
                  data-testid={`plano-stage-${s.key}`}
                >
                  <span className="text-2xl font-semibold tracking-tight text-foreground">
                    {plano_acao.stage[s.key]}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <span className={cn("h-2 w-2 rounded-full", s.dot)} />
                    {s.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Ações abertas por pilar */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ações abertas por pilar
              </p>
              {plano_acao.pilarBars.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {plano_acao.pilarBars.map((p) => (
                    <div
                      key={p.slug}
                      className="flex items-center gap-3"
                      data-testid={`plano-pilar-${p.slug}`}
                    >
                      <span className="w-28 shrink-0 truncate text-sm text-foreground">
                        {p.label}
                      </span>
                      <Progress
                        value={
                          plano_acao.maxPilar > 0
                            ? (p.count / plano_acao.maxPilar) * 100
                            : 0
                        }
                        className="h-2 flex-1"
                      />
                      <span className="w-6 shrink-0 text-right text-sm font-medium text-foreground">
                        {p.count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma ação aberta no momento.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tarefas — execution list */}
        <Card data-testid="painel-tarefas">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListTodo className="h-4 w-4 text-primary" />
                Tarefas
              </CardTitle>
              <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs font-medium">
                {(["equipe", "minhas"] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => setTaskScope(scope)}
                    aria-pressed={taskScope === scope}
                    className={cn(
                      "rounded-md px-3 py-1 capitalize transition-colors",
                      taskScope === scope
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    data-testid={`tarefas-toggle-${scope}`}
                  >
                    {scope}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Status counters */}
            <div className="grid grid-cols-3 gap-3">
              {(["a_fazer", "fazendo", "concluida"] as const).map((st) => {
                const meta = TAREFA_STATUS_META[st];
                return (
                  <div
                    key={st}
                    className="flex flex-col gap-1 rounded-lg border border-border bg-muted/20 px-3 py-2.5"
                    data-testid={`tarefa-status-${st}`}
                  >
                    <span className="text-2xl font-semibold tracking-tight text-foreground">
                      {tarefaStats.counts[st]}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                      {meta.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Task rows */}
            {tarefasLoading ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-lg bg-muted/40"
                  />
                ))}
              </div>
            ) : tarefaStats.rows.length > 0 ? (
              <div className="flex flex-col gap-2">
                {tarefaStats.rows.map((t) => {
                  const meta = TAREFA_STATUS_META[t.status];
                  const prazoDate = parsePrazo(t.prazo);
                  const overdue =
                    prazoDate != null &&
                    prazoDate < today &&
                    t.status !== "concluida";
                  return (
                    <Link
                      key={t.id}
                      href={`/portal/clinica/${clinicId}/acao`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2 transition-colors hover:border-primary/40"
                      data-testid={`tarefa-${t.id}`}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium text-foreground">
                          {t.titulo}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="truncate">Ação: {t.acaoTitulo}</span>
                          {t.responsavelNome && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="truncate">
                                {t.responsavelNome}
                              </span>
                            </>
                          )}
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge variant={meta.badge} className="text-[11px]">
                          {meta.label}
                        </Badge>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs",
                            overdue
                              ? "font-medium text-red-600"
                              : "text-muted-foreground",
                          )}
                        >
                          <CalendarClock className="h-3 w-3" />
                          {formatPrazo(t.prazo)}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                compact
                icon={CheckCircle2}
                title="Nenhuma tarefa"
                description={
                  taskScope === "minhas"
                    ? "Você não tem tarefas atribuídas nesta clínica."
                    : "Ainda não há tarefas no plano de ação desta clínica."
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4 ─ Hub de módulos */}
      <div className="flex flex-col gap-6">
        <h2 className="flex items-center gap-2 text-lg font-medium tracking-tight text-foreground">
          <LayoutGrid className="h-5 w-5 text-primary" />
          Módulos
        </h2>
        {MODULE_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {group.modules.map((module) => (
                <ModuleCard
                  key={module.secao}
                  clinicId={clinicId}
                  module={module}
                  indicators={indicators}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
