import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
import { Loader2, AlertTriangle, ArrowLeft, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getStoredToken } from "@/hooks/use-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string) {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

interface DiagnosticData {
  id: string;
  clinicId: string;
  versao: number;
  status: string;
  scoreGlobal: number;
  scoresPilares: Record<string, number>;
  iniciadoEm?: string;
  concluidoEm?: string;
  createdAt?: string;
}

interface ClinicData {
  id: string;
  nome: string;
  fantasia?: string | null;
}

function DeltaBadge({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.05) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        0.0
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-green-600">
        <TrendingUp className="h-3 w-3" />+{delta.toFixed(1)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-500">
      <TrendingDown className="h-3 w-3" />
      {delta.toFixed(1)}
    </span>
  );
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function DiagnosticoComparar() {
  const [, navigate] = useLocation();

  const params = new URLSearchParams(window.location.search);
  const idA = params.get("a") ?? "";
  const idB = params.get("b") ?? "";

  const { data: diagA, isLoading: loadingA } = useQuery<DiagnosticData>({
    queryKey: ["diagnostic", idA],
    queryFn: () => apiFetch(`/diagnostics/${idA}`),
    enabled: !!idA,
  });

  const { data: diagB, isLoading: loadingB } = useQuery<DiagnosticData>({
    queryKey: ["diagnostic", idB],
    queryFn: () => apiFetch(`/diagnostics/${idB}`),
    enabled: !!idB,
  });

  const { data: clinic } = useQuery<ClinicData>({
    queryKey: ["clinic", diagA?.clinicId],
    queryFn: () => apiFetch(`/clinics/${diagA!.clinicId}`),
    enabled: !!diagA?.clinicId,
  });

  const isLoading = loadingA || loadingB;

  if (!idA || !idB) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertTriangle className="h-10 w-10 text-yellow-500" />
        <p className="text-muted-foreground">Dois diagnósticos são necessários para comparar.</p>
        <Button variant="outline" onClick={() => navigate("/diagnostico/select")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!diagA || !diagB) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertTriangle className="h-10 w-10 text-yellow-500" />
        <p className="text-muted-foreground">Não foi possível carregar os diagnósticos.</p>
        <Button variant="outline" onClick={() => navigate("/diagnostico/select")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  if (diagA.clinicId !== diagB.clinicId) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertTriangle className="h-10 w-10 text-yellow-500" />
        <p className="text-muted-foreground">Os dois diagnósticos devem ser da mesma clínica.</p>
        <Button variant="outline" onClick={() => navigate("/diagnostico/select")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  const isAOlder =
    diagA.versao !== diagB.versao
      ? diagA.versao < diagB.versao
      : (diagA.iniciadoEm ?? "") <= (diagB.iniciadoEm ?? "");

  const anterior = isAOlder ? diagA : diagB;
  const atual = isAOlder ? diagB : diagA;

  const scoresA = anterior.scoresPilares ?? {};
  const scoresB = atual.scoresPilares ?? {};

  const hasScores = Object.keys(scoresA).length > 0 || Object.keys(scoresB).length > 0;

  if (!hasScores) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertTriangle className="h-10 w-10 text-yellow-500" />
        <p className="text-muted-foreground text-center max-w-xs">
          Nenhum dos diagnósticos selecionados possui scores calculados. Complete os diagnósticos antes de comparar.
        </p>
        <Button variant="outline" onClick={() => navigate("/diagnostico/select")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  const radarData = PILAR_ORDER.filter(
    (slug) => scoresA[slug] != null || scoresB[slug] != null
  ).map((slug) => ({
    pilar: PILAR_INFO[slug]?.short ?? slug,
    [labelA(anterior)]: scoresA[slug] ?? 0,
    [labelB(atual)]: scoresB[slug] ?? 0,
  }));

  const tableRows = PILAR_ORDER.filter(
    (slug) => scoresA[slug] != null || scoresB[slug] != null
  ).map((slug) => {
    const a = scoresA[slug] ?? 0;
    const b = scoresB[slug] ?? 0;
    return {
      slug,
      nome: PILAR_INFO[slug]?.nome ?? slug,
      color: PILAR_INFO[slug]?.color ?? "#888",
      scoreA: a,
      scoreB: b,
      delta: b - a,
    };
  });

  const globalDelta = (atual.scoreGlobal ?? 0) - (anterior.scoreGlobal ?? 0);

  const clinicName = clinic?.fantasia || clinic?.nome || "Clínica";

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigate("/diagnostico/select")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Comparação de Diagnósticos</h1>
          <p className="text-sm text-muted-foreground">{clinicName}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <DiagCard diag={anterior} label="Anterior" colorClass="border-indigo-400" />
        <div className="flex flex-col items-center justify-center gap-1">
          <div className="text-2xl font-bold text-center">
            <DeltaBadge delta={globalDelta} />
          </div>
          <div className="text-xs text-muted-foreground text-center">Score Global</div>
          <div className="text-xs text-muted-foreground text-center mt-1 px-2">
            {globalDelta > 0.05
              ? "A clínica evoluiu!"
              : globalDelta < -0.05
              ? "Houve retrocesso"
              : "Sem variação significativa"}
          </div>
        </div>
        <DiagCard diag={atual} label="Atual" colorClass="border-emerald-400" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Radar Comparativo
            <Badge variant="outline" className="text-xs font-normal ml-auto">
              Escala 1–5
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={340}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="pilar" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(val) => [Number(val).toFixed(1), ""]} />
              <Legend />
              <Radar
                name={`V${anterior.versao} — Anterior`}
                dataKey={labelA(anterior)}
                stroke="#6366f1"
                fill="#6366f1"
                fillOpacity={0.25}
                dot={{ r: 3 }}
              />
              <Radar
                name={`V${atual.versao} — Atual`}
                dataKey={labelB(atual)}
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.25}
                dot={{ r: 3 }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scores por Pilar</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                    Pilar
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium text-indigo-600">
                    V{anterior.versao} — Anterior
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium text-emerald-600">
                    V{atual.versao} — Atual
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                    Variação
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr
                    key={row.slug}
                    className="border-b last:border-0 hover:bg-accent/30 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: row.color }}
                        />
                        <span className="font-medium">{row.nome}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-indigo-600">
                      {row.scoreA.toFixed(1)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">
                      {row.scoreB.toFixed(1)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <DeltaBadge delta={row.delta} />
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/40 font-semibold">
                  <td className="px-4 py-2.5">Score Global</td>
                  <td className="px-4 py-2.5 text-right text-indigo-600">
                    {anterior.scoreGlobal?.toFixed(1) ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-emerald-600">
                    {atual.scoreGlobal?.toFixed(1) ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DeltaBadge delta={globalDelta} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function labelA(d: DiagnosticData) {
  return `v${d.versao}_a`;
}

function labelB(d: DiagnosticData) {
  return `v${d.versao}_b`;
}

function DiagCard({
  diag,
  label,
  colorClass,
}: {
  diag: DiagnosticData;
  label: string;
  colorClass: string;
}) {
  const dateStr =
    diag.concluidoEm
      ? formatDate(diag.concluidoEm)
      : diag.iniciadoEm
      ? formatDate(diag.iniciadoEm)
      : "—";

  return (
    <Card className={`border-2 ${colorClass}`}>
      <CardContent className="pt-5 pb-4 flex flex-col gap-1">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {label}
        </div>
        <div className="text-xl font-bold">Versão {diag.versao}</div>
        <div className="text-xs text-muted-foreground">{dateStr}</div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-2xl font-bold text-primary">
            {diag.scoreGlobal?.toFixed(1) ?? "—"}
          </span>
          <span className="text-muted-foreground text-sm">/ 5,0</span>
        </div>
        <Badge
          variant={
            diag.status === "concluido"
              ? "default"
              : diag.status === "em_andamento"
              ? "secondary"
              : "outline"
          }
          className="w-fit mt-1"
        >
          {diag.status === "concluido"
            ? "Concluído"
            : diag.status === "em_andamento"
            ? "Em andamento"
            : diag.status}
        </Badge>
      </CardContent>
    </Card>
  );
}
