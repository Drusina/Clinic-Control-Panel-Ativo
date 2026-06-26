import { useMemo, useState } from "react";
import { useListClinics } from "@workspace/api-client-react";
import type { Clinic, ClinicStatus, ClinicPlano } from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Activity,
  Building2,
  AlertTriangle,
  Rocket,
  CheckCircle2,
  Search,
  ArrowRight,
} from "lucide-react";
import { useLocation } from "wouter";
import { setActiveClinicId } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type SemaforoLevel = "green" | "amber" | "red";

const STATUS_LABEL: Record<ClinicStatus, string> = {
  prospect: "Prospect",
  proposta: "Proposta",
  contrato: "Contrato",
  trial: "Trial",
  ativa: "Ativa",
  suspensa: "Suspensa",
  desativada: "Desativada",
};

const PLANO_LABEL: Record<ClinicPlano, string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

const SEMAFORO_DOT: Record<SemaforoLevel, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

const DAY_MS = 86_400_000;

function computeSemaforo(c: Clinic): { level: SemaforoLevel; reasons: string[] } {
  const reasons: string[] = [];

  const last = c.lastTrilhaActivityAt ? new Date(c.lastTrilhaActivityAt) : null;
  const daysSince = last
    ? Math.floor((Date.now() - last.getTime()) / DAY_MS)
    : null;
  const trilhaStalled =
    c.progresso < 100 && (last === null || (daysSince !== null && daysSince > 7));
  if (trilhaStalled) {
    reasons.push(
      daysSince !== null ? `Trilha parada há ${daysSince}d` : "Trilha sem atividade",
    );
  }

  const overdue = c.overdueActionsCount ?? 0;
  if (overdue > 0) {
    reasons.push(
      `${overdue} ${overdue === 1 ? "pendência em atraso" : "pendências em atraso"}`,
    );
  }

  const risks = c.openCriticalRisksCount ?? 0;
  if (risks > 0) {
    reasons.push(
      `${risks} ${risks === 1 ? "risco crítico" : "riscos críticos"}`,
    );
  }

  const level: SemaforoLevel =
    reasons.length >= 2 ? "red" : reasons.length === 1 ? "amber" : "green";
  return { level, reasons };
}

function isEmImplantacao(c: Clinic): boolean {
  if (c.status === "desativada" || c.status === "suspensa") return false;
  if (c.status === "prospect" || c.status === "proposta") return false;
  return c.progresso < 100;
}

type FilterKey = "todas" | "atencao" | "criticas" | "implantacao";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "atencao", label: "Atenção" },
  { key: "criticas", label: "Críticas" },
  { key: "implantacao", label: "Em implantação" },
];

function KpiCard({
  title,
  value,
  hint,
  icon: Icon,
  tone,
  testId,
}: {
  title: string;
  value: number;
  hint: string;
  icon: typeof Building2;
  tone?: "destructive";
  testId: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon
          className={cn(
            "h-4 w-4",
            tone === "destructive" ? "text-destructive" : "text-muted-foreground",
          )}
        />
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "text-2xl font-bold",
            tone === "destructive" && "text-destructive",
          )}
          data-testid={testId}
        >
          {value}
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function ClinicCard({
  clinic,
  onEnter,
}: {
  clinic: Clinic;
  onEnter: (id: string) => void;
}) {
  const { level, reasons } = computeSemaforo(clinic);
  const name = clinic.fantasia || clinic.nome;

  return (
    <Card className="flex flex-col" data-testid="clinic-card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn("h-2.5 w-2.5 shrink-0 rounded-full", SEMAFORO_DOT[level])}
              aria-hidden
            />
            <CardTitle className="truncate text-base" title={name}>
              {name}
            </CardTitle>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{STATUS_LABEL[clinic.status]}</Badge>
          <Badge variant="secondary">{PLANO_LABEL[clinic.plano]}</Badge>
          <Badge variant="outline" className="font-normal">
            Etapa {clinic.etapa}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Progresso</span>
            <span className="font-medium text-foreground">{clinic.progresso}%</span>
          </div>
          <Progress value={clinic.progresso} className="h-2" />
        </div>

        <div className="min-h-[2.5rem] text-xs">
          {reasons.length === 0 ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> Tudo em dia
            </span>
          ) : (
            <ul className="space-y-0.5 text-muted-foreground">
              {reasons.map((r) => (
                <li key={r} className="flex items-center gap-1.5">
                  <span
                    className={cn("h-1.5 w-1.5 rounded-full", SEMAFORO_DOT[level])}
                  />
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button
          className="mt-auto w-full gap-2"
          onClick={() => onEnter(clinic.id)}
          data-testid={`enter-clinic-${clinic.id}`}
        >
          Entrar na clínica
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<FilterKey>("todas");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useListClinics({ pageSize: 1000 });
  const clinics = useMemo(() => data?.data ?? [], [data]);

  const kpis = useMemo(() => {
    const ativas = clinics.filter((c) => c.status === "ativa").length;
    const implantacao = clinics.filter(isEmImplantacao).length;
    const atencao = clinics.filter(
      (c) => computeSemaforo(c).level !== "green",
    ).length;
    return {
      total: data?.total ?? clinics.length,
      ativas,
      implantacao,
      atencao,
    };
  }, [clinics, data]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clinics.filter((c) => {
      if (q) {
        const hay = `${c.nome} ${c.fantasia ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === "todas") return true;
      if (filter === "implantacao") return isEmImplantacao(c);
      const level = computeSemaforo(c).level;
      if (filter === "atencao") return level === "amber";
      if (filter === "criticas") return level === "red";
      return true;
    });
  }, [clinics, filter, search]);

  const enterClinic = (id: string) => {
    setActiveClinicId(id);
    navigate(`/admin/clinicas/${id}?tab=overview`);
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Activity className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1
          className="text-3xl font-bold tracking-tight text-foreground"
          data-testid="painel-title"
        >
          Painel
        </h1>
        <p className="text-muted-foreground">
          Visão geral da carteira de clínicas. Entre em uma clínica para operá-la.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total de clínicas"
          value={kpis.total}
          hint="Carteira completa"
          icon={Building2}
          testId="kpi-total"
        />
        <KpiCard
          title="Ativas"
          value={kpis.ativas}
          hint="Em operação"
          icon={CheckCircle2}
          testId="kpi-ativas"
        />
        <KpiCard
          title="Em implantação"
          value={kpis.implantacao}
          hint="Onboarding em andamento"
          icon={Rocket}
          testId="kpi-implantacao"
        />
        <KpiCard
          title="Precisam de atenção"
          value={kpis.atencao}
          hint="Sinais amarelos ou vermelhos"
          icon={AlertTriangle}
          tone="destructive"
          testId="kpi-atencao"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              onClick={() => setFilter(f.key)}
              data-testid={`filter-${f.key}`}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar clínica..."
            className="pl-8"
            data-testid="painel-search"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          Nenhuma clínica encontrada para este filtro.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((c) => (
            <ClinicCard key={c.id} clinic={c} onEnter={enterClinic} />
          ))}
        </div>
      )}
    </div>
  );
}
