import { useEffect, useMemo, useState } from "react";
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
} from "@workspace/api-client-react";
import {
  getStoredToken,
  useMyClinics,
  useCurrentRole,
  MY_CLINICS_QUERY_KEY,
} from "@/hooks/use-auth";
import { TrilhaStepper } from "@/components/trilha/trilha-stepper";
import { ClinicLogo } from "@/components/clinic-logo";
import { EmptyState } from "@/components/empty-state";
import { PILAR_INFO, PILAR_ORDER, pilarShort } from "@/lib/pilares";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import {
  LayoutDashboard,
  Rocket,
  Stethoscope,
  ShieldAlert,
  ListChecks,
  CalendarDays,
  Workflow,
  FileText,
  Paperclip,
  Users,
  Building2,
  KeyRound,
  Activity,
  ArrowRight,
  MapPin,
  Upload,
  Plus,
  AlertCircle,
  CircleAlert,
  CheckCircle2,
  Mail,
  Phone,
  UserRound,
  Gauge,
  TrendingUp,
  TrendingDown,
  Minus,
  CalendarClock,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface IcsStatus {
  delegacoes: number;
  risks: number;
  actions: number;
  seeded: boolean;
}

interface Pendencia {
  key: string;
  label: string;
  secao?: string;
  query?: string;
}

type IconType = typeof LayoutDashboard;

interface ModuleDef {
  secao: string;
  title: string;
  description: string;
  icon: IconType;
  metric?: (ics: IcsStatus) => string | null;
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
        secao: "kickoff",
        title: "Kickoff",
        description: "Apresentação e alinhamento inicial",
        icon: Rocket,
      },
      {
        secao: "diagnostico",
        title: "Diagnóstico 360°",
        description: "Avaliação de maturidade da clínica",
        icon: Stethoscope,
      },
    ],
  },
  {
    label: "Operação",
    modules: [
      {
        secao: "riscos",
        title: "Mapa de Riscos",
        description: "Riscos identificados e prioridades",
        icon: ShieldAlert,
        metric: (ics) => (ics.seeded ? `${ics.risks} riscos` : null),
      },
      {
        secao: "acao",
        title: "Plano de Ação",
        description: "Kanban de ações e tarefas",
        icon: ListChecks,
        metric: (ics) => (ics.seeded ? `${ics.actions} ações` : null),
      },
      {
        secao: "agenda",
        title: "Agenda",
        description: "Reuniões, tarefas e marcos com lembretes",
        icon: CalendarDays,
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
  {
    label: "Pessoas & Sistemas",
    modules: [
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
];

const SHORTCUTS: { secao: string; label: string; icon: IconType; query?: string }[] = [
  { secao: "diagnostico", label: "Abrir Diagnóstico", icon: Stethoscope },
  { secao: "diagnostico", label: "Nova delegação", icon: Plus, query: "?aba=delegacao" },
  { secao: "documentos", label: "Enviar documento", icon: Upload },
  { secao: "acao", label: "Ver plano de ação", icon: ListChecks },
];

const PORTAL_MODULE_SECOES: Record<string, { secao: string; label: string }> = {
  documentos: { secao: "documentos", label: "Abrir Documentos" },
  kickoff: { secao: "kickoff", label: "Abrir Kickoff" },
  diagnostico: { secao: "diagnostico", label: "Abrir Diagnóstico" },
  riscos: { secao: "riscos", label: "Abrir Mapa de Riscos" },
  plano_acao: { secao: "acao", label: "Abrir Plano de Ação" },
};

const PRIORIDADE_WEIGHT: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
const PRIORIDADE_LABEL: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};
const PRIORIDADE_VARIANT: Record<string, "destructive" | "secondary" | "outline"> = {
  alta: "destructive",
  media: "secondary",
  baixa: "outline",
};
const RISK_OPEN_STATUS = new Set(["identificado", "em_mitigacao"]);
const RISK_HIGH_SEVERIDADE = 14; // severidade > 14 ⇒ nível "alto" (vide severidadeToNivel)

/** Coerce a possibly-unknown score value (scoresPilares is typed loosely). */
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

interface KpiCardProps {
  icon: IconType;
  label: string;
  value: string;
  hint?: React.ReactNode;
  tone?: "default" | "danger" | "success";
  testId?: string;
}

function KpiCard({ icon: Icon, label, value, hint, tone = "default", testId }: KpiCardProps) {
  const toneClass =
    tone === "danger"
      ? "text-red-600"
      : tone === "success"
        ? "text-emerald-600"
        : "text-primary";
  return (
    <Card data-testid={testId}>
      <CardContent className="flex flex-col gap-2 p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <Icon className={`h-4 w-4 ${toneClass}`} />
        </div>
        <span className="text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </span>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function ModuleCard({
  clinicId,
  module,
  ics,
}: {
  clinicId: string;
  module: ModuleDef;
  ics: IcsStatus | null;
}) {
  const Icon = module.icon;
  const metric = ics && module.metric ? module.metric(ics) : null;
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
      <h3 className="font-semibold text-foreground transition-colors group-hover:text-primary">
        {module.title}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{module.description}</p>
      {metric && (
        <div className="mt-3">
          <Badge variant="secondary" className="text-[11px] font-medium">
            {metric}
          </Badge>
        </div>
      )}
    </Link>
  );
}

export default function PortalDashboard({ clinicId }: { clinicId: string }) {
  const { data: clinic } = useGetClinic(clinicId, {
    query: { enabled: !!clinicId, queryKey: getGetClinicQueryKey(clinicId) },
  });
  const { data: myClinics } = useMyClinics();
  const card = myClinics?.clinics.find((c) => c.id === clinicId) ?? null;

  const { data: risks, isLoading: risksLoading } = useListRisks(clinicId, {
    query: { enabled: !!clinicId, queryKey: getListRisksQueryKey(clinicId) },
  });
  const { data: actions, isLoading: actionsLoading } = useListActions(
    clinicId,
    undefined,
    {
      query: {
        enabled: !!clinicId,
        queryKey: getListActionsQueryKey(clinicId),
      },
    },
  );
  const { data: diagnostics, isLoading: diagnosticsLoading } = useListDiagnostics(
    clinicId,
    {
      query: {
        enabled: !!clinicId,
        queryKey: getListDiagnosticsQueryKey(clinicId),
      },
    },
  );

  const { data: currentUser } = useCurrentRole();
  const isTeamMember = currentUser?.role === "team_member";
  // "Minhas próximas tarefas" é um recurso do gestor (team_member). `mine` é
  // sempre forçado no backend para team_member; passamos explicitamente para
  // deixar a intenção clara. Não buscamos para super_admin (não tem tarefas
  // próprias atribuídas numa clínica).
  const tarefaParams = { mine: true, status: "open" } as const;
  const { data: minhasTarefas, isLoading: tarefasLoading } = useListClinicTarefas(
    clinicId,
    tarefaParams,
    {
      query: {
        enabled: !!clinicId && isTeamMember,
        queryKey: getListClinicTarefasQueryKey(clinicId, tarefaParams),
      },
    },
  );

  const [ics, setIcs] = useState<IcsStatus | null>(null);
  const [icsLoaded, setIcsLoaded] = useState(false);

  useEffect(() => {
    if (!clinicId) return;
    const token = getStoredToken();
    const headers: HeadersInit = token
      ? { Authorization: `Bearer ${token}` }
      : {};
    let cancelled = false;
    fetch(`${BASE}/api/clinics/${clinicId}/ics-status`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: IcsStatus | null) => {
        if (cancelled) return;
        if (data) setIcs(data);
        setIcsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setIcsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  const nome = clinic?.nome ?? card?.fantasia ?? card?.nome ?? "Clínica";
  const progresso = card?.progresso ?? 0;
  const etapa = card?.etapa ?? null;

  // ─── Operational aggregation (client-side, from clinic-scoped data) ───
  const ops = useMemo(() => {
    const riskList: Risk[] = risks ?? [];
    const actionList: Action[] = actions ?? [];
    const diagList: Diagnostic[] = diagnostics ?? [];

    const concluded = diagList
      .filter((d) => d.status === "concluido")
      .sort((a, b) => b.versao - a.versao);
    const current = concluded[0] ?? null;
    const previous = concluded[1] ?? null;

    const currentScore = current ? toNum(current.scoreGlobal) : null;
    const prevScore = previous ? toNum(previous.scoreGlobal) : null;
    const scoreDelta =
      currentScore != null && prevScore != null ? currentScore - prevScore : null;

    const radarData = PILAR_ORDER.map((slug) => {
      const cur = current
        ? toNum((current.scoresPilares as Record<string, unknown> | null | undefined)?.[slug])
        : null;
      const prev = previous
        ? toNum((previous.scoresPilares as Record<string, unknown> | null | undefined)?.[slug])
        : null;
      return {
        slug,
        pilar: pilarShort(slug),
        atual: cur ?? 0,
        anterior: prev ?? 0,
      };
    });

    const weakest = current
      ? Object.entries(
          (current.scoresPilares as Record<string, unknown> | null | undefined) ?? {},
        )
          .map(([slug, v]) => ({ slug, score: toNum(v) }))
          .filter((x): x is { slug: string; score: number } => x.score != null)
          .sort((a, b) => a.score - b.score)
          .slice(0, 3)
      : [];

    const openHighRisks = riskList
      .filter(
        (r) =>
          RISK_OPEN_STATUS.has(r.status) &&
          (r.nivel === "alto" || r.severidade > RISK_HIGH_SEVERIDADE),
      )
      .sort((a, b) => b.severidade - a.severidade);

    const today = startOfToday();
    const in7 = new Date(today);
    in7.setDate(in7.getDate() + 7);

    const activeActions = actionList.filter((a) => a.coluna !== "done");
    const overdue = activeActions.filter((a) => {
      const p = parsePrazo(a.prazo);
      return p != null && p < today;
    });
    const upcoming = activeActions.filter((a) => {
      const p = parsePrazo(a.prazo);
      return p != null && p >= today && p <= in7;
    });

    const doneCount = actionList.filter((a) => a.coluna === "done").length;
    const completionPct =
      actionList.length > 0 ? Math.round((doneCount / actionList.length) * 100) : null;

    const nextActions = [...activeActions]
      .sort((a, b) => {
        const wa = PRIORIDADE_WEIGHT[a.prioridade ?? ""] ?? 3;
        const wb = PRIORIDADE_WEIGHT[b.prioridade ?? ""] ?? 3;
        if (wa !== wb) return wa - wb;
        const pa = parsePrazo(a.prazo);
        const pb = parsePrazo(b.prazo);
        if (pa && pb) return pa.getTime() - pb.getTime();
        if (pa) return -1;
        if (pb) return 1;
        return 0;
      })
      .slice(0, 6);

    return {
      current,
      previous,
      currentScore,
      scoreDelta,
      radarData,
      weakest,
      openHighRisks,
      overdue,
      upcoming,
      doneCount,
      completionPct,
      nextActions,
      totalActions: actionList.length,
    };
  }, [risks, actions, diagnostics]);

  const opsLoading = risksLoading || actionsLoading || diagnosticsLoading;
  const today = startOfToday();

  const pendencias = useMemo<Pendencia[]>(() => {
    const list: Pendencia[] = [];
    if (icsLoaded && ics) {
      if (!ics.seeded) {
        list.push({
          key: "diagnostico",
          label: "Diagnóstico ainda não iniciado",
          secao: "diagnostico",
        });
      } else {
        if (ics.delegacoes === 0)
          list.push({
            key: "delegacao",
            label: "Nenhuma delegação criada",
            secao: "diagnostico",
            query: "?aba=delegacao",
          });
        if (ics.risks === 0)
          list.push({
            key: "riscos",
            label: "Nenhum risco mapeado",
            secao: "riscos",
          });
        if (ics.actions === 0)
          list.push({
            key: "acao",
            label: "Plano de ação sem tarefas",
            secao: "acao",
          });
      }
    }
    if (progresso < 100) {
      list.push({
        key: "implantacao",
        label: `Implantação ${progresso}% concluída`,
        secao: "kickoff",
      });
    }
    return list;
  }, [ics, icsLoaded, progresso]);

  // "Minhas próximas tarefas" — tarefas abertas do gestor ordenadas por prazo
  // (atrasadas primeiro, sem prazo por último), limitadas às 6 mais urgentes.
  const proximasTarefas = useMemo<ClinicTarefa[]>(() => {
    const list: ClinicTarefa[] = minhasTarefas ?? [];
    return [...list]
      .sort((a, b) => {
        const pa = parsePrazo(a.prazo);
        const pb = parsePrazo(b.prazo);
        if (pa && pb) return pa.getTime() - pb.getTime();
        if (pa) return -1;
        if (pb) return 1;
        return 0;
      })
      .slice(0, 6);
  }, [minhasTarefas]);

  return (
    <div className="flex flex-col gap-8">
      {/* Resumo da clínica */}
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
            {clinic?.status && (
              <Badge variant="outline" className="capitalize">
                {clinic.status}
              </Badge>
            )}
            {clinic?.plano && (
              <Badge variant="secondary" className="capitalize">
                Plano {clinic.plano}
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
            <span className="text-foreground">{etapa ?? "Progresso da implantação"}</span>
            <span className="text-primary">{progresso}%</span>
          </div>
          <Progress value={progresso} className="h-2" />
        </div>
      </section>

      {/* KPIs operacionais */}
      <section
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        data-testid="painel-kpis"
      >
        <KpiCard
          icon={Gauge}
          label="Maturidade"
          tone="default"
          testId="kpi-maturidade"
          value={
            ops.currentScore != null
              ? `${ops.currentScore.toFixed(1)} / 5,0`
              : "—"
          }
          hint={
            ops.scoreDelta != null ? (
              <span
                className={`inline-flex items-center gap-1 font-medium ${
                  ops.scoreDelta > 0
                    ? "text-emerald-600"
                    : ops.scoreDelta < 0
                      ? "text-red-600"
                      : "text-muted-foreground"
                }`}
              >
                {ops.scoreDelta > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : ops.scoreDelta < 0 ? (
                  <TrendingDown className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                {ops.scoreDelta > 0 ? "+" : ""}
                {ops.scoreDelta.toFixed(1)} vs. anterior
              </span>
            ) : ops.currentScore != null ? (
              "Primeiro diagnóstico"
            ) : (
              "Sem diagnóstico concluído"
            )
          }
        />
        <KpiCard
          icon={ShieldAlert}
          label="Riscos críticos"
          tone={ops.openHighRisks.length > 0 ? "danger" : "success"}
          testId="kpi-riscos-criticos"
          value={String(ops.openHighRisks.length)}
          hint="Alto impacto, em aberto"
        />
        <KpiCard
          icon={CalendarClock}
          label="Ações atrasadas"
          tone={ops.overdue.length > 0 ? "danger" : "success"}
          testId="kpi-acoes-atrasadas"
          value={String(ops.overdue.length)}
          hint={`${ops.upcoming.length} vencem em 7 dias`}
        />
        <KpiCard
          icon={ListChecks}
          label="Conclusão do plano"
          tone="default"
          testId="kpi-conclusao-plano"
          value={ops.completionPct != null ? `${ops.completionPct}%` : "—"}
          hint={
            ops.totalActions > 0
              ? `${ops.doneCount} de ${ops.totalActions} ações`
              : "Sem ações no plano"
          }
        />
      </section>

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

      {/* Painel operacional: desempenho + ações + riscos */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Evolução do diagnóstico */}
        <Card className="xl:col-span-7" data-testid="painel-evolucao">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Stethoscope className="h-4 w-4 text-primary" />
              Evolução do diagnóstico
            </CardTitle>
          </CardHeader>
          <CardContent>
            {opsLoading ? (
              <div className="h-[300px] animate-pulse rounded-lg bg-muted/40" />
            ) : ops.current ? (
              <div className="flex flex-col gap-4">
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={ops.radarData} outerRadius="72%">
                    <PolarGrid />
                    <PolarAngleAxis dataKey="pilar" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                    {ops.previous && (
                      <Radar
                        name={`Versão ${ops.previous.versao}`}
                        dataKey="anterior"
                        stroke="#94a3b8"
                        fill="#94a3b8"
                        fillOpacity={0.2}
                      />
                    )}
                    <Radar
                      name={`Versão ${ops.current.versao}`}
                      dataKey="atual"
                      stroke="#6366f1"
                      fill="#6366f1"
                      fillOpacity={0.35}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Tooltip formatter={(val) => [Number(val).toFixed(1), ""]} />
                  </RadarChart>
                </ResponsiveContainer>
                {ops.weakest.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Pilares mais frágeis
                    </p>
                    <div className="flex flex-col gap-2">
                      {ops.weakest.map((w) => (
                        <div
                          key={w.slug}
                          className="flex items-center gap-3"
                          data-testid={`weakest-${w.slug}`}
                        >
                          <span className="w-28 shrink-0 truncate text-sm text-foreground">
                            {PILAR_INFO[w.slug]?.short ?? w.slug}
                          </span>
                          <Progress value={(w.score / 5) * 100} className="h-2 flex-1" />
                          <span className="w-10 shrink-0 text-right text-sm font-medium text-foreground">
                            {w.score.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                icon={Stethoscope}
                title="Nenhum diagnóstico concluído"
                description="Conclua um Diagnóstico 360° para acompanhar a maturidade da clínica e sua evolução."
                action={
                  <Link href={`/portal/clinica/${clinicId}/diagnostico`}>
                    <Button size="sm">Abrir Diagnóstico</Button>
                  </Link>
                }
              />
            )}
          </CardContent>
        </Card>

        {/* Próximas ações */}
        <Card className="xl:col-span-5" data-testid="painel-proximas-acoes">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4 text-primary" />
              Próximas ações
            </CardTitle>
          </CardHeader>
          <CardContent>
            {opsLoading ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
                ))}
              </div>
            ) : ops.nextActions.length > 0 ? (
              <div className="flex flex-col gap-2">
                {ops.nextActions.map((a) => {
                  const prazoDate = parsePrazo(a.prazo);
                  const overdue = prazoDate != null && prazoDate < today;
                  const prio = a.prioridade ?? "baixa";
                  return (
                    <Link
                      key={a.id}
                      href={`/portal/clinica/${clinicId}/acao`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2 transition-colors hover:border-primary/40"
                      data-testid={`proxima-acao-${a.id}`}
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-foreground">
                          {a.titulo}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          {a.responsavelNome && (
                            <span className="truncate">{a.responsavelNome}</span>
                          )}
                          <span
                            className={`inline-flex items-center gap-1 ${
                              overdue ? "font-medium text-red-600" : ""
                            }`}
                          >
                            <CalendarClock className="h-3 w-3" />
                            {formatPrazo(a.prazo)}
                          </span>
                        </span>
                      </div>
                      <Badge
                        variant={PRIORIDADE_VARIANT[prio] ?? "outline"}
                        className="shrink-0 text-[11px]"
                      >
                        {PRIORIDADE_LABEL[prio] ?? prio}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                compact
                icon={CheckCircle}
                title="Nenhuma ação pendente"
                description="Todas as ações do plano estão concluídas ou ainda não há tarefas."
                action={
                  <Link href={`/portal/clinica/${clinicId}/acao`}>
                    <Button size="sm" variant="outline">
                      Abrir Plano de Ação
                    </Button>
                  </Link>
                }
              />
            )}
          </CardContent>
        </Card>

        {/* Riscos em foco */}
        <Card className="xl:col-span-12" data-testid="painel-riscos-foco">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-primary" />
              Riscos em foco
            </CardTitle>
          </CardHeader>
          <CardContent>
            {opsLoading ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/40" />
                ))}
              </div>
            ) : ops.openHighRisks.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ops.openHighRisks.slice(0, 6).map((r) => (
                  <Link
                    key={r.id}
                    href={`/portal/clinica/${clinicId}/riscos`}
                    className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50/60 p-3 transition-colors hover:border-red-300 dark:border-red-900/50 dark:bg-red-950/20"
                    data-testid={`risco-foco-${r.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-sm font-medium text-foreground">
                        {r.nome}
                      </span>
                      <Badge variant="destructive" className="shrink-0 text-[11px]">
                        {r.severidade}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{pilarShort(r.pilarSlug)}</span>
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-red-500" />
                        P{r.probabilidade} × I{r.impacto}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                icon={CheckCircle2}
                title="Nenhum risco crítico em aberto"
                description="Não há riscos de alto impacto pendentes de mitigação no momento."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        {/* Hub de módulos */}
        <div className="flex flex-col gap-6 xl:col-span-8">
          <h2 className="flex items-center gap-2 text-lg font-medium tracking-tight text-foreground">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            Hub de Módulos
          </h2>
          {MODULE_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.modules.map((module) => (
                  <ModuleCard
                    key={module.secao}
                    clinicId={clinicId}
                    module={module}
                    ics={ics}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Coluna de apoio */}
        <div className="flex flex-col gap-6 xl:col-span-4">
          {isTeamMember && (
            <Card data-testid="painel-minhas-tarefas">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListChecks className="h-4 w-4 text-primary" />
                  Minhas próximas tarefas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {tarefasLoading ? (
                  <div className="flex flex-col gap-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
                    ))}
                  </div>
                ) : proximasTarefas.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {proximasTarefas.map((t) => {
                      const prazoDate = parsePrazo(t.prazo);
                      const overdue = prazoDate != null && prazoDate < today;
                      return (
                        <Link
                          key={t.id}
                          href={`/portal/clinica/${clinicId}/acao`}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2 transition-colors hover:border-primary/40"
                          data-testid={`minha-tarefa-${t.id}`}
                        >
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-sm font-medium text-foreground">
                              {t.titulo}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {t.acaoTitulo}
                            </span>
                          </div>
                          <span
                            className={`inline-flex shrink-0 items-center gap-1 text-xs ${
                              overdue ? "font-medium text-red-600" : "text-muted-foreground"
                            }`}
                          >
                            <CalendarClock className="h-3 w-3" />
                            {formatPrazo(t.prazo)}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon={CheckCircle}
                    title="Nenhuma tarefa pendente"
                    description="Você não tem tarefas em aberto atribuídas nesta clínica."
                  />
                )}
              </CardContent>
            </Card>
          )}

          <Card data-testid="painel-pendencias">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="h-4 w-4 text-primary" />
                Pendências
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendencias.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {pendencias.map((p) => {
                    const inner = (
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                        <span className="flex items-center gap-2 text-foreground">
                          <CircleAlert className="h-4 w-4 shrink-0 text-amber-600" />
                          {p.label}
                        </span>
                        {p.secao && (
                          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </div>
                    );
                    return p.secao ? (
                      <Link
                        key={p.key}
                        href={`/portal/clinica/${clinicId}/${p.secao}${p.query ?? ""}`}
                        className="block transition-opacity hover:opacity-80"
                        data-testid={`pendencia-${p.key}`}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div key={p.key} data-testid={`pendencia-${p.key}`}>
                        {inner}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Nenhuma pendência no momento.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Atalhos rápidos</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {SHORTCUTS.map((s) => {
                const Icon = s.icon;
                return (
                  <Link key={s.label} href={`/portal/clinica/${clinicId}/${s.secao}${s.query ?? ""}`}>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {s.label}
                    </Button>
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card data-testid="painel-ics-status">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" />
                Status do ICS
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ics?.seeded ? (
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Delegações</span>
                    <span className="font-medium">{ics.delegacoes}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Riscos</span>
                    <span className="font-medium">{ics.risks}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Ações</span>
                    <span className="font-medium">{ics.actions}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Dados operacionais ainda não carregados para esta clínica.
                </p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="painel-contato-principal">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="h-4 w-4 text-primary" />
                Contato principal
              </CardTitle>
            </CardHeader>
            <CardContent>
              {clinic?.responsavel || clinic?.email || clinic?.whatsapp ? (
                <div className="flex flex-col gap-3 text-sm">
                  {clinic?.responsavel && (
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {clinic.responsavel}
                      </span>
                      {clinic?.cargo && (
                        <span className="text-xs text-muted-foreground">
                          {clinic.cargo}
                        </span>
                      )}
                    </div>
                  )}
                  {clinic?.email && (
                    <a
                      href={`mailto:${clinic.email}`}
                      className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-primary"
                    >
                      <Mail className="h-4 w-4 shrink-0" />
                      <span className="truncate">{clinic.email}</span>
                    </a>
                  )}
                  {clinic?.whatsapp && (
                    <a
                      href={`https://wa.me/${clinic.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-primary"
                    >
                      <Phone className="h-4 w-4 shrink-0" />
                      <span>{clinic.whatsapp}</span>
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum contato principal cadastrado.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
