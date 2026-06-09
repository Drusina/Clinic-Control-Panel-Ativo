import { useState, useRef, useMemo } from "react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Sparkles, TrendingUp, AlertTriangle, CheckCircle2, Zap, ChevronDown, ChevronUp, Plus, ArrowLeft, FileDown, Unlock, ListChecks } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getStoredToken } from "@/hooks/use-auth";
import jsPDF from "jspdf";

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
  iniciadoEm?: string;
  createdAt?: string;
  insightsIa?: {
    pontos_fortes: Array<{ pilar: string; titulo: string; descricao: string }>;
    pontos_criticos: Array<{ pilar: string; titulo: string; descricao: string; impacto: string }>;
    acoes_sugeridas: Array<{ pilar: string; titulo: string; descricao: string; prioridade: string; prazo: string }>;
  };
}

interface ClinicData {
  id: string;
  nome: string;
  fantasia?: string | null;
}

interface Pergunta {
  id: string;
  pilarSlug: string;
  pilarNome: string;
  pilarOrdem: number;
  texto: string;
  tipo: string;
  ordem: number;
}

interface RespostaItem {
  perguntaId: string;
  valor: string;
}

function formatAnswer(tipo: string, valor: string | undefined | null): string {
  if (valor == null || valor === "") return "Sem resposta";
  switch (tipo) {
    case "sim_nao":
      return valor === "sim" ? "Sim" : valor === "nao" ? "Não" : valor;
    case "escala_1_5":
      return `${valor} / 5`;
    default:
      return valor;
  }
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

async function svgElementToDataUrl(svgEl: SVGSVGElement): Promise<string> {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const rect = svgEl.getBoundingClientRect();
  const w = Math.round(rect.width) || 600;
  const h = Math.round(rect.height) || 400;
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));

  const svgStr = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * 2;
      canvas.height = h * 2;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(2, 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load SVG as image"));
    };
    img.src = url;
  });
}

function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[];
}

export default function DiagnosticoResultado() {
  const params = useParams<{ id: string }>();
  const diagnosticoId = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const radarRef = useRef<HTMLDivElement>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

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
    refetchInterval: (query) => {
      if (query.state.status === "error") return false;
      return 7000;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const { data: clinic } = useQuery<ClinicData>({
    queryKey: ["clinic", diagnostic?.clinicId],
    queryFn: () => apiFetch(`/clinics/${diagnostic!.clinicId}`),
    enabled: !!diagnostic?.clinicId,
  });

  const { data: perguntas } = useQuery<Pergunta[]>({
    queryKey: ["perguntas"],
    queryFn: () => apiFetch("/perguntas"),
  });

  const { data: respostas } = useQuery<RespostaItem[]>({
    queryKey: ["respostas", diagnosticoId],
    queryFn: () => apiFetch(`/diagnostics/${diagnosticoId}/respostas`),
    enabled: !!diagnosticoId,
  });

  const reopenMut = useMutation({
    mutationFn: () => apiFetch(`/diagnostics/${diagnosticoId}/reopen`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["diagnostic", diagnosticoId] });
      toast({ title: "Diagnóstico reaberto", description: "Agora você pode editar as respostas." });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao reabrir diagnóstico", description: err.message, variant: "destructive" });
    },
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

  const handleExportPdf = async () => {
    if (!diagnostic) return;
    setExportingPdf(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = 210;
      const pageH = 297;
      const marginL = 18;
      const marginR = 18;
      const contentW = pageW - marginL - marginR;
      let y = 18;

      const clinicName = clinic?.fantasia || clinic?.nome || "Clínica";
      const diagnosticDate = diagnostic.iniciadoEm
        ? new Date(diagnostic.iniciadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
        : diagnostic.createdAt
        ? new Date(diagnostic.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
        : "Data não disponível";

      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, pageW, 14, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("IONEX360", marginL, 9.5);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("Diagnostico 360 - Relatorio de Resultados", pageW - marginR, 9.5, { align: "right" });

      y = 26;
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(clinicName, marginL, y);
      y += 7;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(`Diagnostico 360 - Versao ${diagnostic.versao} | ${diagnosticDate}`, marginL, y);
      doc.text(`Status: ${diagnostic.status === "concluido" ? "Concluido" : diagnostic.status === "em_andamento" ? "Em andamento" : diagnostic.status}`, pageW - marginR, y, { align: "right" });
      y += 5;
      doc.setDrawColor(220, 220, 220);
      doc.line(marginL, y, pageW - marginR, y);
      y += 8;

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text("Score Global", marginL, y);
      y += 6;
      doc.setFontSize(32);
      doc.setTextColor(79, 70, 229);
      doc.text(`${diagnostic.scoreGlobal?.toFixed(1) ?? "--"} / 5,0`, marginL, y);
      y += 4;

      const barX = marginL;
      const barY = y;
      const barW = contentW;
      const barH = 4;
      const fillW = ((diagnostic.scoreGlobal ?? 0) / 5) * barW;
      doc.setFillColor(230, 230, 250);
      doc.roundedRect(barX, barY, barW, barH, 2, 2, "F");
      if (fillW > 0) {
        doc.setFillColor(79, 70, 229);
        doc.roundedRect(barX, barY, fillW, barH, 2, 2, "F");
      }
      y += barH + 10;

      doc.setTextColor(30, 30, 30);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Radar por Pilar", marginL, y);
      y += 5;

      const radarImgH = 70;
      let chartAdded = false;
      if (radarRef.current) {
        const svgEl = radarRef.current.querySelector("svg");
        if (svgEl) {
          try {
            const dataUrl = await svgElementToDataUrl(svgEl as SVGSVGElement);
            const svgRect = svgEl.getBoundingClientRect();
            const svgAspect = svgRect.width > 0 ? svgRect.width / svgRect.height : 1.6;
            const radarImgW = Math.min(contentW, radarImgH * svgAspect);
            const radarX = marginL + (contentW - radarImgW) / 2;
            doc.addImage(dataUrl, "PNG", radarX, y, radarImgW, radarImgH);
            y += radarImgH + 8;
            chartAdded = true;
          } catch {
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(160, 160, 160);
            doc.text("[Grafico radar nao disponivel]", marginL, y + 6);
            y += 12;
            toast({ title: "Aviso", description: "O gráfico radar não pôde ser incluído no PDF.", variant: "destructive" });
          }
        }
      }
      if (!chartAdded) {
        y += 4;
      }

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text("Scores por Pilar", marginL, y);
      y += 6;

      const scores = diagnostic.scoresPilares ?? {};
      const metas = diagnostic.metasPilares ?? {};
      const pilarRows = PILAR_ORDER.filter((slug) => scores[slug] != null);

      const colWidths = [contentW * 0.52, contentW * 0.16, contentW * 0.16, contentW * 0.16];
      const headers = ["Pilar", "Score", "Meta", "Delta"];
      const headerX = [marginL, marginL + colWidths[0], marginL + colWidths[0] + colWidths[1], marginL + colWidths[0] + colWidths[1] + colWidths[2]];

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(120, 120, 120);
      doc.text(headers[0], headerX[0], y);
      doc.text(headers[1], headerX[1] + colWidths[1], y, { align: "right" });
      doc.text(headers[2], headerX[2] + colWidths[2], y, { align: "right" });
      doc.text(headers[3], headerX[3] + colWidths[3], y, { align: "right" });
      y += 2;
      doc.setDrawColor(200, 200, 200);
      doc.line(marginL, y, pageW - marginR, y);
      y += 4;

      doc.setFont("helvetica", "normal");
      for (const slug of pilarRows) {
        const info = PILAR_INFO[slug] ?? { nome: slug, color: "#888" };
        const score = scores[slug] ?? 0;
        const meta = metas[slug] ?? 4;
        const delta = score - meta;

        const rgb = hexToRgb(info.color);
        doc.setFillColor(rgb.r, rgb.g, rgb.b);
        doc.circle(headerX[0] + 1.5, y - 1.5, 1.5, "F");

        doc.setTextColor(30, 30, 30);
        doc.setFontSize(8.5);
        doc.text(info.nome, headerX[0] + 5, y);

        doc.setFont("helvetica", "bold");
        doc.text(score.toFixed(1), headerX[1] + colWidths[1], y, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setTextColor(120, 120, 120);
        doc.text(meta.toFixed(1), headerX[2] + colWidths[2], y, { align: "right" });

        if (delta >= 0) {
          doc.setTextColor(22, 163, 74);
        } else {
          doc.setTextColor(220, 38, 38);
        }
        doc.text(`${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`, headerX[3] + colWidths[3], y, { align: "right" });

        y += 5;
        doc.setDrawColor(240, 240, 240);
        doc.line(marginL, y - 1, pageW - marginR, y - 1);
      }

      const insights = diagnostic.insightsIa;
      if (insights) {
        if (y > pageH - 60) {
          doc.addPage();
          y = 20;
        } else {
          y += 6;
        }

        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 30, 30);
        doc.text("Insights por IA", marginL, y);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(130, 130, 130);
        doc.text("Analise estrategica gerada pelo Claude (Anthropic)", marginL, y + 5);
        y += 12;

        const ensureSpace = (needed: number) => {
          if (y + needed > pageH - 15) {
            doc.addPage();
            y = 20;
          }
        };

        if (insights.pontos_fortes.length > 0) {
          ensureSpace(14);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(22, 101, 52);
          doc.text(`Pontos Fortes (${insights.pontos_fortes.length})`, marginL, y);
          y += 6;

          for (const item of insights.pontos_fortes) {
            const pilarLabel = PILAR_INFO[item.pilar]?.short ?? item.pilar;
            const titleLine = `${item.titulo} [${pilarLabel}]`;
            const descLines = wrapText(doc, item.descricao, contentW - 6);
            const blockH = 5 + descLines.length * 4 + 4;
            ensureSpace(blockH);

            doc.setFillColor(240, 253, 244);
            doc.setDrawColor(187, 247, 208);
            doc.roundedRect(marginL, y - 3, contentW, blockH, 2, 2, "FD");

            doc.setFontSize(8.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(22, 101, 52);
            doc.text(titleLine, marginL + 3, y + 1);
            y += 5;
            doc.setFont("helvetica", "normal");
            doc.setTextColor(50, 50, 50);
            doc.setFontSize(8);
            for (const line of descLines) {
              doc.text(line, marginL + 3, y);
              y += 4;
            }
            y += 3;
          }
          y += 2;
        }

        if (insights.pontos_criticos.length > 0) {
          ensureSpace(14);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(153, 27, 27);
          doc.text(`Pontos Criticos (${insights.pontos_criticos.length})`, marginL, y);
          y += 6;

          for (const item of insights.pontos_criticos) {
            const pilarLabel = PILAR_INFO[item.pilar]?.short ?? item.pilar;
            const impactoLabel = item.impacto === "alto" ? "Alto" : item.impacto === "medio" ? "Medio" : "Baixo";
            const titleLine = `${item.titulo} [${pilarLabel}] - Impacto ${impactoLabel}`;
            const descLines = wrapText(doc, item.descricao, contentW - 6);
            const blockH = 5 + descLines.length * 4 + 4;
            ensureSpace(blockH);

            doc.setFillColor(255, 241, 242);
            doc.setDrawColor(254, 202, 202);
            doc.roundedRect(marginL, y - 3, contentW, blockH, 2, 2, "FD");

            doc.setFontSize(8.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(153, 27, 27);
            doc.text(titleLine, marginL + 3, y + 1);
            y += 5;
            doc.setFont("helvetica", "normal");
            doc.setTextColor(50, 50, 50);
            doc.setFontSize(8);
            for (const line of descLines) {
              doc.text(line, marginL + 3, y);
              y += 4;
            }
            y += 3;
          }
          y += 2;
        }

        if (insights.acoes_sugeridas.length > 0) {
          ensureSpace(14);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(91, 33, 182);
          doc.text(`Acoes Sugeridas (${insights.acoes_sugeridas.length})`, marginL, y);
          y += 6;

          for (const item of insights.acoes_sugeridas) {
            const pilarLabel = PILAR_INFO[item.pilar]?.short ?? item.pilar;
            const prioLabel = item.prioridade === "alta" ? "Alta" : item.prioridade === "media" ? "Media" : "Baixa";
            const prazoLabel = item.prazo === "curto" ? "Curto prazo" : item.prazo === "medio" ? "Medio prazo" : "Longo prazo";
            const titleLine = `${item.titulo} [${pilarLabel}] - ${prioLabel} prioridade | ${prazoLabel}`;
            const descLines = wrapText(doc, item.descricao, contentW - 6);
            const blockH = 5 + descLines.length * 4 + 4;
            ensureSpace(blockH);

            doc.setFillColor(245, 243, 255);
            doc.setDrawColor(221, 214, 254);
            doc.roundedRect(marginL, y - 3, contentW, blockH, 2, 2, "FD");

            doc.setFontSize(8.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(91, 33, 182);
            doc.text(titleLine, marginL + 3, y + 1);
            y += 5;
            doc.setFont("helvetica", "normal");
            doc.setTextColor(50, 50, 50);
            doc.setFontSize(8);
            for (const line of descLines) {
              doc.text(line, marginL + 3, y);
              y += 4;
            }
            y += 3;
          }
        }
      }

      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(180, 180, 180);
        doc.text(`IONEX360 | Diagnostico 360 | Gerado em ${new Date().toLocaleDateString("pt-BR")}`, marginL, pageH - 8);
        doc.text(`${p} / ${totalPages}`, pageW - marginR, pageH - 8, { align: "right" });
      }

      const safeName = clinicName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      doc.save(`diagnostico_${safeName}_v${diagnostic.versao}.pdf`);
      toast({ title: "PDF exportado com sucesso!" });
    } catch (err) {
      console.error("PDF export error:", err);
      toast({ title: "Erro ao exportar PDF", description: String(err), variant: "destructive" });
    } finally {
      setExportingPdf(false);
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

  const respostasMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of respostas ?? []) m[r.perguntaId] = r.valor;
    return m;
  }, [respostas]);

  const questionsByPilar = useMemo(() => {
    const map = new Map<string, { slug: string; nome: string; ordem: number; questions: Pergunta[] }>();
    for (const q of perguntas ?? []) {
      let row = map.get(q.pilarSlug);
      if (!row) {
        row = { slug: q.pilarSlug, nome: q.pilarNome, ordem: q.pilarOrdem, questions: [] };
        map.set(q.pilarSlug, row);
      }
      row.questions.push(q);
    }
    const groups = Array.from(map.values());
    groups.sort((a, b) => a.ordem - b.ordem);
    for (const g of groups) g.questions.sort((a, b) => a.ordem - b.ordem);
    return groups;
  }, [perguntas]);

  const toggle = (section: keyof typeof expandedSections) =>
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => navigate("/diagnostico")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Resultado do Diagnóstico 360°</h1>
          <p className="text-sm text-muted-foreground">Versão {diagnostic.versao} · {diagnostic.status}</p>
        </div>
        {diagnostic.status === "concluido" && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={reopenMut.isPending} className="gap-2">
                {reopenMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Unlock className="h-4 w-4" />
                )}
                Reabrir relatório
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reabrir diagnóstico?</AlertDialogTitle>
                <AlertDialogDescription>
                  O diagnóstico voltará para "Em andamento" e as respostas poderão ser editadas
                  novamente. Conclua-o de novo após as alterações para atualizar os scores.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => reopenMut.mutate()}>Reabrir</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <Button
          variant="outline"
          onClick={handleExportPdf}
          disabled={exportingPdf || !diagnostic.scoreGlobal}
          className="gap-2"
        >
          {exportingPdf ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="h-4 w-4" />
          )}
          {exportingPdf ? "Gerando PDF..." : "Exportar PDF"}
        </Button>
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
              <div ref={radarRef}>
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
              </div>
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

      {questionsByPilar.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              Perguntas e Respostas por Pilar
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {questionsByPilar.map((group) => {
              const info = PILAR_INFO[group.slug] ?? { nome: group.nome, short: group.nome, color: "#888" };
              return (
                <div key={group.slug} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: info.color }}
                    />
                    <h4 className="font-semibold text-sm">{info.nome}</h4>
                  </div>
                  <div className="flex flex-col divide-y rounded-md border">
                    {group.questions.map((q, idx) => {
                      const valor = respostasMap[q.id];
                      const answered = valor != null && valor !== "";
                      return (
                        <div key={q.id} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <p className="text-sm text-muted-foreground sm:flex-1">
                            <span className="mr-1 font-medium text-foreground">{idx + 1}.</span>
                            {q.texto}
                          </p>
                          <p className={`text-sm font-medium sm:w-40 sm:text-right ${answered ? "" : "text-muted-foreground/60 italic"}`}>
                            {formatAnswer(q.tipo, valor)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

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

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 128, g: 128, b: 128 };
}
