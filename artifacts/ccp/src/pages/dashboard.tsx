import {
  useGetDashboardSummary,
  useGetDashboardPipeline,
  useGetDashboardRecentActivity,
  useGetDashboardDiagnostics,
  getGetDashboardSummaryQueryKey,
  getGetDashboardPipelineQueryKey,
  getGetDashboardRecentActivityQueryKey,
  getGetDashboardDiagnosticsQueryKey,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Activity, Building2, Bell, AlertTriangle, TrendingUp, ClipboardList } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";

const PILAR_INFO: Record<string, { short: string; color: string }> = {
  estrategia: { short: "Estratégia", color: "#6366f1" },
  financeiro: { short: "Financeiro", color: "#10b981" },
  contabil: { short: "Contábil", color: "#f59e0b" },
  marketing: { short: "Marketing", color: "#f43f5e" },
  operacoes: { short: "Operações", color: "#06b6d4" },
  pessoas: { short: "Pessoas", color: "#8b5cf6" },
  tecnologia: { short: "Tecnologia", color: "#0ea5e9" },
  compliance: { short: "Compliance", color: "#64748b" },
};

const PILAR_ORDER = [
  "estrategia",
  "financeiro",
  "contabil",
  "marketing",
  "operacoes",
  "pessoas",
  "tecnologia",
  "compliance",
];

function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = Math.round((score / 5) * 100);
  const color =
    pct >= 70 ? "bg-emerald-100 text-emerald-700" : pct >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      {score.toFixed(1)}
    </span>
  );
}

function PillarMiniChart({ scoresPilares }: { scoresPilares: Record<string, number> | null | undefined }) {
  if (!scoresPilares) return <span className="text-muted-foreground text-xs">—</span>;

  const data = PILAR_ORDER.filter((slug) => scoresPilares[slug] != null).map((slug) => ({
    slug,
    short: PILAR_INFO[slug]?.short ?? slug,
    value: scoresPilares[slug],
    color: PILAR_INFO[slug]?.color ?? "#888",
  }));

  if (data.length === 0) return <span className="text-muted-foreground text-xs">—</span>;

  return (
    <ResponsiveContainer width={240} height={36}>
      <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap="10%">
        <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {data.map((entry) => (
            <Cell key={entry.slug} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function Dashboard() {
  const [, navigate] = useLocation();

  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });

  const { data: pipeline, isLoading: loadingPipeline } = useGetDashboardPipeline({
    query: { queryKey: getGetDashboardPipelineQueryKey() },
  });

  const { data: activity, isLoading: loadingActivity } = useGetDashboardRecentActivity({
    query: { queryKey: getGetDashboardRecentActivityQueryKey() },
  });

  const { data: diagnosticsOverview, isLoading: loadingDiagnostics } = useGetDashboardDiagnostics({
    query: { queryKey: getGetDashboardDiagnosticsQueryKey() },
  });

  if (loadingSummary || loadingPipeline || loadingActivity) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Activity className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground" data-testid="dashboard-title">
          Dashboard
        </h1>
        <p className="text-muted-foreground">Visão geral da operação das clínicas.</p>
      </div>

      {summary && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total de Clínicas</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stats-total-clinics">
                {summary.totalClinics}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.clinicasAtivas} ativas, {summary.clinicasTrial} em trial
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Receita Mensal (Ativa)</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stats-total-revenue">
                {formatCurrency(summary.receitaMensalTotal)}
              </div>
              <p className="text-xs text-muted-foreground">
                +{formatCurrency(summary.receitaPipeline)} no pipeline
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Ações Atrasadas</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive" data-testid="stats-delayed-actions">
                {summary.acoesAtrasadas}
              </div>
              <p className="text-xs text-muted-foreground">Em planos de ação</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Notificações Não Lidas</CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stats-unread-notifications">
                {summary.notificacoesNaoLidas}
              </div>
              <p className="text-xs text-muted-foreground">Aguardando sua atenção</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Pipeline de Clínicas</CardTitle>
            <CardDescription>Distribuição de clínicas por status atual</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            {pipeline && pipeline.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={pipeline}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="status"
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => String(value)}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    contentStyle={{ borderRadius: "8px", border: "1px solid var(--border)" }}
                  />
                  <Bar dataKey="count" fill="currentColor" radius={[4, 4, 0, 0]} className="fill-primary" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[350px] items-center justify-center text-muted-foreground">
                Nenhum dado no pipeline
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Atividades Recentes</CardTitle>
            <CardDescription>O que aconteceu recentemente nas clínicas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {activity?.length ? (
                activity.map((item) => (
                  <div className="flex items-center" key={item.id}>
                    <div className="ml-4 space-y-1">
                      <p className="text-sm font-medium leading-none">{item.titulo}</p>
                      <p className="text-sm text-muted-foreground">{item.descricao}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(item.createdAt), "dd 'de' MMMM, HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-4">Nenhuma atividade recente</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="diagnostics-overview">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Diagnósticos Concluídos
            </CardTitle>
            <CardDescription>Resumo de pontuações por clínica — clique em uma linha para ver o resultado completo</CardDescription>
          </div>
          {diagnosticsOverview && diagnosticsOverview.length > 0 && (
            <Badge variant="secondary">{diagnosticsOverview.length} diagnóstico{diagnosticsOverview.length !== 1 ? "s" : ""}</Badge>
          )}
        </CardHeader>
        <CardContent>
          {loadingDiagnostics ? (
            <div className="flex h-24 items-center justify-center">
              <Activity className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : !diagnosticsOverview || diagnosticsOverview.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-muted-foreground text-sm">
              Nenhum diagnóstico concluído ainda
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="diagnostics-table">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 pr-4 text-left font-medium">Clínica</th>
                    <th className="pb-2 pr-4 text-left font-medium">Versão</th>
                    <th className="pb-2 pr-4 text-left font-medium">Concluído em</th>
                    <th className="pb-2 pr-4 text-left font-medium">Score Global</th>
                    <th className="pb-2 text-left font-medium">Pilares</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnosticsOverview.map((diag) => (
                    <tr
                      key={diag.id}
                      className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/diagnostico/${diag.id}/resultado`)}
                      data-testid="diagnostics-row"
                    >
                      <td className="py-3 pr-4 font-medium">{diag.clinicNome}</td>
                      <td className="py-3 pr-4 text-muted-foreground">v{diag.versao}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {format(new Date(diag.concluidoEm), "dd/MM/yyyy", { locale: ptBR })}
                      </td>
                      <td className="py-3 pr-4">
                        <ScoreBadge score={diag.scoreGlobal} />
                      </td>
                      <td className="py-3">
                        <PillarMiniChart scoresPilares={diag.scoresPilares as Record<string, number> | null} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
