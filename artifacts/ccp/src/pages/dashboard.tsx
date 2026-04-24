import {
  useGetDashboardSummary,
  useGetDashboardPipeline,
  useGetDashboardRecentActivity,
  getGetDashboardSummaryQueryKey,
  getGetDashboardPipelineQueryKey,
  getGetDashboardRecentActivityQueryKey,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Activity, Building2, Bell, AlertTriangle, TrendingUp, Users } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });

  const { data: pipeline, isLoading: loadingPipeline } = useGetDashboardPipeline({
    query: { queryKey: getGetDashboardPipelineQueryKey() },
  });

  const { data: activity, isLoading: loadingActivity } = useGetDashboardRecentActivity({
    query: { queryKey: getGetDashboardRecentActivityQueryKey() },
  });

  if (loadingSummary || loadingPipeline || loadingActivity) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Activity className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value
    );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground" data-testid="dashboard-title">
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Visão geral da operação das clínicas.
        </p>
      </div>

      {summary && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total de Clínicas</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stats-total-clinics">{summary.totalClinics}</div>
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
              <div className="text-2xl font-bold" data-testid="stats-total-revenue">{formatCurrency(summary.receitaMensalTotal)}</div>
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
              <div className="text-2xl font-bold text-destructive" data-testid="stats-delayed-actions">{summary.acoesAtrasadas}</div>
              <p className="text-xs text-muted-foreground">
                Em planos de ação
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Notificações Não Lidas</CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stats-unread-notifications">{summary.notificacoesNaoLidas}</div>
              <p className="text-xs text-muted-foreground">
                Aguardando sua atenção
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Pipeline de Clínicas</CardTitle>
            <CardDescription>
              Distribuição de clínicas por status atual
            </CardDescription>
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
                  <Bar
                    dataKey="count"
                    fill="currentColor"
                    radius={[4, 4, 0, 0]}
                    className="fill-primary"
                  />
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
                      <p className="text-sm font-medium leading-none">
                        {item.titulo}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {item.descricao}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(item.createdAt), "dd 'de' MMMM, HH:mm", {
                          locale: ptBR,
                        })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-4">
                  Nenhuma atividade recente
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
