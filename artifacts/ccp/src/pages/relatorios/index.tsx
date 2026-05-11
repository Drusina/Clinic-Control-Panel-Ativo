import { useState, type ReactElement } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getStoredToken } from "@/hooks/use-auth";
import { useClinicsForCurrentUser } from "@/hooks/use-clinics-for-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Search, ChevronRight, Download, FileText, AlertTriangle, KanbanSquare, Users, Building2, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { pdf, type DocumentProps } from "@react-pdf/renderer";
import { DiagnosticoPdf, type DiagnosticoPdfProps } from "@/components/pdf/DiagnosticoPdf";
import { MapaRiscosPdf } from "@/components/pdf/MapaRiscosPdf";
import { PlanoAcaoPdf } from "@/components/pdf/PlanoAcaoPdf";
import { DelegacaoPdf } from "@/components/pdf/DelegacaoPdf";
import { DocsConstitutivosPdf } from "@/components/pdf/DocsConstitutivosPdf";
import { AtaConsolidadaPdf } from "@/components/pdf/AtaConsolidadaPdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string) {
  const token = getStoredToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const REPORTS = [
  {
    id: "diagnostico",
    title: "Diagnóstico 360°",
    desc: "Radar de scores por pilar com insights de IA",
    icon: ClipboardList,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-100",
  },
  {
    id: "riscos",
    title: "Mapa de Riscos",
    desc: "Matriz de riscos por probabilidade e impacto",
    icon: AlertTriangle,
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-100",
  },
  {
    id: "acoes",
    title: "Plano de Ação Mensal",
    desc: "Ações agrupadas por etapa do kanban",
    icon: KanbanSquare,
    color: "text-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-100",
  },
  {
    id: "delegacao",
    title: "Relatório de Delegação",
    desc: "Responsáveis por pilar e status de delegação",
    icon: Users,
    color: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-100",
  },
  {
    id: "docs-constitutivos",
    title: "Documentos Constitutivos",
    desc: "Status de envio dos documentos societários",
    icon: FileText,
    color: "text-orange-600",
    bg: "bg-orange-50",
    border: "border-orange-100",
  },
  {
    id: "ata",
    title: "Ata Consolidada",
    desc: "Registros das sessões de kick-off",
    icon: Building2,
    color: "text-teal-600",
    bg: "bg-teal-50",
    border: "border-teal-100",
  },
];

type Clinic = {
  id: string;
  nome: string;
};

export default function RelatoriosPage() {
  const params = useParams<{ clinicId: string }>();
  const clinicId = params.clinicId;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [generating, setGenerating] = useState<string | null>(null);

  const { clinics } = useClinicsForCurrentUser({ pageSize: 200 });
  const clinic = clinics.find(c => c.id === clinicId);

  if (!clinicId) return <ClinicSelector />;

  const clinicName = clinic?.nome ?? "Clínica";
  const dateStr = format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR });

  const handleGenerate = async (reportId: string) => {
    setGenerating(reportId);
    try {
      let doc: ReactElement | null = null;
      let filename = "";

      if (reportId === "diagnostico") {
        const list = await apiFetch(`/api/clinics/${clinicId}/diagnostics`);
        const latest = Array.isArray(list) && list.length > 0 ? list[list.length - 1] : null;
        const scoreGlobal = latest?.scoreGlobal != null ? Number(latest.scoreGlobal) : 0;
        const scoresPilares: Record<string, number> = (latest?.scoresPilares as Record<string, number>) ?? {};
        const insightsIa = (latest?.insightsIa as DiagnosticoPdfProps["insightsIa"]) ?? null;
        doc = (
          <DiagnosticoPdf
            clinicName={clinicName}
            date={dateStr}
            scoreGlobal={scoreGlobal}
            scoresPilares={scoresPilares}
            insightsIa={insightsIa}
          />
        );
        filename = `diagnostico-360-${clinicName.toLowerCase().replace(/\s+/g, "-")}.pdf`;
      } else if (reportId === "riscos") {
        const risks = await apiFetch(`/api/clinics/${clinicId}/risks`) ?? [];
        doc = <MapaRiscosPdf clinicName={clinicName} date={dateStr} risks={risks} />;
        filename = `mapa-riscos-${clinicName.toLowerCase().replace(/\s+/g, "-")}.pdf`;
      } else if (reportId === "acoes") {
        const acoes = await apiFetch(`/api/clinics/${clinicId}/actions`) ?? [];
        doc = <PlanoAcaoPdf clinicName={clinicName} date={dateStr} acoes={acoes} />;
        filename = `plano-acao-${clinicName.toLowerCase().replace(/\s+/g, "-")}.pdf`;
      } else if (reportId === "delegacao") {
        const delegacoes = await apiFetch(`/api/clinics/${clinicId}/delegacoes`) ?? [];
        doc = <DelegacaoPdf clinicName={clinicName} date={dateStr} delegacoes={delegacoes} />;
        filename = `delegacao-${clinicName.toLowerCase().replace(/\s+/g, "-")}.pdf`;
      } else if (reportId === "docs-constitutivos") {
        const docs = await apiFetch(`/api/clinics/${clinicId}/docs-constitutivos`) ?? [];
        doc = <DocsConstitutivosPdf clinicName={clinicName} date={dateStr} docs={docs} />;
        filename = `docs-constitutivos-${clinicName.toLowerCase().replace(/\s+/g, "-")}.pdf`;
      } else if (reportId === "ata") {
        const kickoffs = await apiFetch(`/api/clinics/${clinicId}/kickoff`) ?? [];
        const ks = Array.isArray(kickoffs) ? kickoffs : kickoffs ? [kickoffs] : [];
        doc = <AtaConsolidadaPdf clinicName={clinicName} date={dateStr} kickoffs={ks} />;
        filename = `ata-consolidada-${clinicName.toLowerCase().replace(/\s+/g, "-")}.pdf`;
      }

      if (!doc) {
        toast({ variant: "destructive", title: "Erro ao gerar relatório" });
        return;
      }

      const blob = await pdf(doc as ReactElement<DocumentProps>).toBlob();
      downloadBlob(blob, filename);
      toast({ title: "Relatório gerado com sucesso!" });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Erro ao gerar relatório", description: "Tente novamente." });
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/relatorios/select")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">
            {clinicName} — Clique em qualquer relatório para gerar e baixar o PDF
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map(report => {
          const Icon = report.icon;
          const isGenerating = generating === report.id;
          return (
            <div
              key={report.id}
              className={`border rounded-xl p-5 ${report.bg} ${report.border} hover:shadow-md transition-shadow cursor-pointer group`}
              onClick={() => !generating && handleGenerate(report.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className={`w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
                    <Icon className={`h-5 w-5 ${report.color}`} />
                  </div>
                  <h3 className="font-semibold text-sm text-foreground">{report.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{report.desc}</p>
                </div>
                <div className="shrink-0">
                  {isGenerating ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    <Download className={`h-5 w-5 ${report.color} opacity-0 group-hover:opacity-100 transition-opacity`} />
                  )}
                </div>
              </div>
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full bg-white hover:bg-white/80 text-xs"
                  disabled={!!generating}
                  onClick={e => { e.stopPropagation(); handleGenerate(report.id); }}
                >
                  {isGenerating ? (
                    <><Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Gerando PDF...</>
                  ) : (
                    <><Download className="h-3 w-3 mr-1.5" /> Baixar PDF</>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-muted/30 rounded-xl p-4 border">
        <p className="text-xs text-muted-foreground">
          Os relatórios são gerados com os dados mais recentes da clínica. O PDF é criado no seu navegador e não é enviado para nenhum servidor.
        </p>
      </div>
    </div>
  );
}

function ClinicSelector() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const { clinics, isLoading } = useClinicsForCurrentUser({ pageSize: 100 });
  const filtered = clinics.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    (c.cidade ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Selecione uma clínica para gerar os relatórios em PDF.</p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} placeholder="Buscar clínica..." className="pl-9" />
      </div>
      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <button key={c.id} onClick={() => navigate(`/relatorios/${c.id}`)}
              className="w-full text-left p-4 border rounded-lg hover:bg-muted/50 transition-colors flex items-center justify-between">
              <div>
                <div className="font-medium">{c.nome}</div>
                <div className="text-sm text-muted-foreground">{c.cidade}{c.uf ? `, ${c.uf}` : ""}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
          {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhuma clínica encontrada.</p>}
        </div>
      )}
    </div>
  );
}
