import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, TrendingUp, AlertTriangle, CheckCircle2, Zap, ChevronDown, ChevronUp, Plus, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getStoredToken } from "@/hooks/use-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

const PILAR_INFO: Record<string, { nome: string; short: string; color: string }> = {
  estrategia: { nome: "Estratégia e Governança", short: "Estratégia", color: "#6366f1" },
  financeiro: { nome: "Financeiro e Fluxo de Caixa", short: "Financeiro", color: "#10b981" },
  contabil: { nome: "Contabilidade e Fiscal", short: "Contábil", color: "#f59e0b" },
  marketing: { nome: "Vendas e Marketing", short: "Marketing", color: "#f43f5e" },
  operacoes: { nome: "Processos Operacionais", short: "Operações", color: "#06b6d4" },
  pessoas: { nome: "Gestão de Pessoas", short: "Pessoas", color: "#8b5cf6" },
  tecnologia: { nome: "Tecnologia e Sistemas", short: "Tecnologia", color: "#0ea5e9" },
  compliance: { nome: "Conformidade e LGPD", short: "Compliance", color: "#64748b" },
};

const PILAR_ORDER = ["estrategia", "financeiro", "contabil", "marketing", "operacoes", "pessoas", "tecnologia", "compliance"];

interface DiagnosticData {
  id: string;
  clinicId: string;
  versao: number;
  status: string;
  scoreGlobal: number;
  scoresPilares: Record<string, number>;
  metasPilares?: Record<string, number>;
  insightsIa?: {
    pontos_fortes: Array<{ pilar: string; titulo: string; descricao: string }>;
    pontos_criticos: Array<{ pilar: string; titulo: string; descricao: string; impacto: string }>;
    acoes_sugeridas: Array<{ pilar: string; titulo: string; descricao: string; prioridade: string; prazo: string }>;
  };
}

function ScoreDelta({ score, meta }: { score: number; meta?: number }) {
  if (!meta) return null;
  const delta = score - meta;
  if (Math.abs(delta) < 0.1) return null;
  return (
    <span className={`text-xs font-medium ml-1 ${delta >= 0 ? "text-green-600" : "text-red-500"}`}>
      {delta >= 0 ? "▲" : "▼"}{Math.abs(delta).toFixed(1)}
    </span>
  );
}

export default function DiagnosticoResultado() {
  const params = useParams<{ id: string }>();
  const diagnosticoId = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [expandedSections, setExpandedSections] = useState({
    fortes: true,
    criticos: true,
    acoes: true,
  });
  const [creatingAction, setCreatingAction] = useState<string | null>(null);

  const { data: diagnostic, isLoading } = useQuery<DiagnosticData>({
    queryKey: ["diagnostic", diagnosticoId],
    queryFn: () => apiFetch(`/diagnostics/${diagnosticoId}`),
    enabled: !!diagnosticoId,
  });

  const analyzesMut = useMutation({
    mutationFn: () =>
      apiFetch("/ai/analyze-diagnostico", {
        method: "POST",
        body: JSON.stringify({ diagnosticoId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["diagnostic", diagnosticoId] });
      toast({ title: "Insights gerados com sucesso!" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao gerar insights", description: err.message, variant: "destructive" });
    },
  });

  const createAction = async (acao: { pilar: string; titulo: string; descricao: string; prioridade: string }) => {
    if (!diagnostic) return;
    setCreatingAction(acao.titulo);
    try {
      await apiFetch(`/clinics/${diagnostic.clinicId}/actions`, {
        method: "POST",
        body: JSON.stringify({
          titulo: acao.titulo,
          descricao: acao.descricao,
          prioridade: acao.prioridade as "alta" | "media" | "baixa",
          coluna: "backlog",
        }),
      });
      toast({ title: "Tarefa criada no Plano de Ação!" });
    } catch {
      toast({ title: "Erro ao criar tarefa", variant: "destructive" });
    } finally {
      setCreatingAction(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!diagnostic) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertTriangle className="h-10 w-10 text-yellow-500" />
        <p className="text-muted-foreground">Diagnóstico não encontrado.</p>
      </div>
    );
  }

  const scores = diagnostic.scoresPilares ?? {};
  const metas = diagnostic.metasPilares ?? {};

  const radarData = PILAR_ORDER.filter((slug) => scores[slug] != null).map((slug) => ({
    pilar: PILAR_INFO[slug]?.short ?? slug,
    score: scores[slug] ?? 0,
    meta: metas[slug] ?? 4,
  }));

  const insights = diagnostic.insightsIa;

  const toggle = (section: keyof typeof expandedSections) =>
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => navigate("/diagnostico")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Resultado do Diagnóstico 360°</h1>
          <p className="text-sm text-muted-foreground">Versão {diagnostic.versao} · {diagnostic.status}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Radar por Pilar
              <Badge variant="outline" className="text-xs font-normal ml-auto">
                Escala 1–5
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {radarData.length === 0 ? (
              <div className="flex items-center justify-center h-52 text-muted-foreground text-sm">
                Nenhum score disponível. Complete o diagnóstico primeiro.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="pilar" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(val) => [Number(val).toFixed(1), ""]} />
                  <Legend />
                  <Radar
                    name="Score ICS"
                    dataKey="score"
                    stroke="#6366f1"
                    fill="#6366f1"
                    fillOpacity={0.3}
                    dot={{ r: 3 }}
                  />
                  <Radar
                    name="Meta"
                    dataKey="meta"
                    stroke="#d97706"
                    fill="none"
                    strokeDasharray="5 5"
                    dot={false}
                  />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score Global</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-4">
            <div className="text-6xl font-extrabold text-primary">
              {diagnostic.scoreGlobal?.toFixed(1) ?? "—"}
            </div>
            <p className="text-sm text-muted-foreground">de 5,0</p>
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden mt-2">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${((diagnostic.scoreGlobal ?? 0) / 5) * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scores por Pilar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4 font-medium">Pilar</th>
                  <th className="text-right py-2 px-2 font-medium">Score</th>
                  <th className="text-right py-2 px-2 font-medium">Meta</th>
                  <th className="text-right py-2 pl-2 font-medium">Delta</th>
                  <th className="text-left py-2 pl-4 font-medium w-40">Barra</th>
                </tr>
              </thead>
              <tbody>
                {PILAR_ORDER.filter((slug) => scores[slug] != null).map((slug) => {
                  const info = PILAR_INFO[slug] ?? { nome: slug, short: slug, color: "#888" };
                  const score = scores[slug] ?? 0;
                  const meta = metas[slug] ?? 4;
                  const delta = score - meta;
                  return (
                    <tr key={slug} className="border-b last:border-0 hover:bg-accent/30">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: info.color }}
                          />
                          {info.nome}
                        </div>
                      </td>
                      <td className="text-right py-2 px-2 font-semibold">{score.toFixed(1)}</td>
                      <td className="text-right py-2 px-2 text-muted-foreground">{meta.toFixed(1)}</td>
                      <td className={`text-right py-2 pl-2 font-medium ${delta >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {delta >= 0 ? "▲" : "▼"}{Math.abs(delta).toFixed(1)}
                      </td>
                      <td className="py-2 pl-4">
                        <div className="w-32 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(score / 5) * 100}%`,
                              background: info.color,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" />
                Insights por IA
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Análise estratégica gerada automaticamente pelo Claude
              </p>
            </div>
            {!insights && (
              <Button
                onClick={() => analyzesMut.mutate()}
                disabled={analyzesMut.isPending || !diagnostic.scoreGlobal}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                {analyzesMut.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {analyzesMut.isPending ? "Gerando insights..." : "Gerar insights IA"}
              </Button>
            )}
            {insights && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => analyzesMut.mutate()}
                disabled={analyzesMut.isPending}
              >
                {analyzesMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Regenerar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {analyzesMut.isPending && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
          <p className="text-sm font-medium">Analisando diagnóstico com IA...</p>
          <p className="text-xs">Isso pode levar alguns segundos</p>
        </div>
      )}

      {insights && (
        <div className="flex flex-col gap-4">
          <Card className="border-green-200">
            <CardHeader
              className="cursor-pointer pb-3"
              onClick={() => toggle("fortes")}
            >
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  Pontos Fortes
                  <Badge variant="outline" className="text-xs text-green-700 border-green-300">
                    {insights.pontos_fortes.length}
                  </Badge>
                </span>
                {expandedSections.fortes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </CardTitle>
            </CardHeader>
            {expandedSections.fortes && (
              <CardContent className="pt-0">
                <div className="flex flex-col gap-3">
                  {insights.pontos_fortes.map((item, i) => (
                    <div key={i} className="flex gap-3 p-3 rounded-lg bg-green-50 border border-green-100">
                      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium text-sm">{item.titulo}</span>
                          <Badge variant="outline" className="text-xs" style={{ color: PILAR_INFO[item.pilar]?.color }}>
                            {PILAR_INFO[item.pilar]?.short ?? item.pilar}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.descricao}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>

          <Card className="border-red-200">
            <CardHeader
              className="cursor-pointer pb-3"
              onClick={() => toggle("criticos")}
            >
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Pontos Críticos
                  <Badge variant="outline" className="text-xs text-red-700 border-red-300">
                    {insights.pontos_criticos.length}
                  </Badge>
                </span>
                {expandedSections.criticos ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </CardTitle>
            </CardHeader>
            {expandedSections.criticos && (
              <CardContent className="pt-0">
                <div className="flex flex-col gap-3">
                  {insights.pontos_criticos.map((item, i) => (
                    <div key={i} className="flex gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                      <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-medium text-sm">{item.titulo}</span>
                          <Badge variant="outline" className="text-xs" style={{ color: PILAR_INFO[item.pilar]?.color }}>
                            {PILAR_INFO[item.pilar]?.short ?? item.pilar}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              item.impacto === "alto"
                                ? "border-red-400 text-red-700"
                                : item.impacto === "medio"
                                ? "border-orange-400 text-orange-700"
                                : "border-yellow-400 text-yellow-700"
                            }`}
                          >
                            Impacto {item.impacto}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.descricao}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>

          <Card className="border-violet-200">
            <CardHeader
              className="cursor-pointer pb-3"
              onClick={() => toggle("acoes")}
            >
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-violet-500" />
                  Ações Sugeridas
                  <Badge variant="outline" className="text-xs text-violet-700 border-violet-300">
                    {insights.acoes_sugeridas.length}
                  </Badge>
                </span>
                {expandedSections.acoes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </CardTitle>
            </CardHeader>
            {expandedSections.acoes && (
              <CardContent className="pt-0">
                <div className="flex flex-col gap-3">
                  {insights.acoes_sugeridas.map((item, i) => (
                    <div key={i} className="flex gap-3 p-3 rounded-lg bg-violet-50 border border-violet-100">
                      <div
                        className={`w-1.5 flex-shrink-0 rounded-full mt-1 ${
                          item.prioridade === "alta"
                            ? "bg-red-500"
                            : item.prioridade === "media"
                            ? "bg-orange-400"
                            : "bg-blue-400"
                        }`}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-medium text-sm">{item.titulo}</span>
                          <Badge variant="outline" className="text-xs" style={{ color: PILAR_INFO[item.pilar]?.color }}>
                            {PILAR_INFO[item.pilar]?.short ?? item.pilar}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              item.prioridade === "alta"
                                ? "border-red-400 text-red-700"
                                : item.prioridade === "media"
                                ? "border-orange-400 text-orange-700"
                                : "border-blue-400 text-blue-700"
                            }`}
                          >
                            {item.prioridade === "alta" ? "Alta prioridade" : item.prioridade === "media" ? "Média prioridade" : "Baixa prioridade"}
                          </Badge>
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            {item.prazo === "curto" ? "Curto prazo" : item.prazo === "medio" ? "Médio prazo" : "Longo prazo"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{item.descricao}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={creatingAction === item.titulo}
                          onClick={() =>
                            createAction({
                              pilar: item.pilar,
                              titulo: item.titulo,
                              descricao: item.descricao,
                              prioridade: item.prioridade,
                            })
                          }
                        >
                          {creatingAction === item.titulo ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Plus className="h-3 w-3 mr-1" />
                          )}
                          Criar tarefa no Plano de Ação
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>

          <div className="flex justify-center">
            <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 bg-muted text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 text-violet-500" />
              Gerado pela IA · Claude (Anthropic)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
