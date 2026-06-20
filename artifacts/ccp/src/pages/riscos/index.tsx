import { useState, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getStoredToken, useCurrentRole, getActiveClinicId } from "@/hooks/use-auth";
import { useClinicsForCurrentUser } from "@/hooks/use-clinics-for-current-user";
import { ClinicSelectorList } from "@/components/clinic-selector-list";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, ArrowLeft, Search, ChevronRight, ChevronDown, Sparkles, ListChecks, History, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { GenerateRisksButton } from "@/components/riscos/generate-risks-button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PILARES = [
  { slug: "estrategia", nome: "Estratégia e Governança" },
  { slug: "financeiro", nome: "Financeiro e Fluxo de Caixa" },
  { slug: "contabil", nome: "Contabilidade e Fiscal" },
  { slug: "marketing", nome: "Vendas, Marketing e Captação" },
  { slug: "operacoes", nome: "Processos Operacionais" },
  { slug: "pessoas", nome: "Gestão de Pessoas e Cultura" },
  { slug: "tecnologia", nome: "Tecnologia e Sistemas" },
  { slug: "compliance", nome: "Compliance e Regulamentação" },
];

const PILAR_COLORS: Record<string, string> = {
  estrategia: "bg-blue-100 text-blue-700",
  financeiro: "bg-green-100 text-green-700",
  contabil: "bg-teal-100 text-teal-700",
  marketing: "bg-purple-100 text-purple-700",
  operacoes: "bg-orange-100 text-orange-700",
  pessoas: "bg-pink-100 text-pink-700",
  tecnologia: "bg-cyan-100 text-cyan-700",
  compliance: "bg-red-100 text-red-700",
};

type PerguntaFonte = {
  pergunta: string;
  resposta: string;
  pilarSlug?: string | null;
};

type Risk = {
  id: string;
  clinicId: string;
  nome: string;
  descricao: string | null;
  probabilidade: number;
  impacto: number;
  severidade: number;
  pilarSlug: string | null;
  responsavel: string | null;
  acoesMitigadoras: string | null;
  status: string;
  statusJustificativa: string | null;
  origem: string;
  nivel: string | null;
  diagnosticoId: string | null;
  perguntasFonte: PerguntaFonte[] | null;
  createdAt: string;
};

async function fetchRiscos(clinicId: string): Promise<Risk[]> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/clinics/${clinicId}/risks`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

type DiagnosticSummary = {
  id: string;
  versao: number;
  status: string;
  concluidoEm: string | null;
  iniciadoEm: string;
};

async function fetchDiagnostics(clinicId: string): Promise<DiagnosticSummary[]> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/clinics/${clinicId}/diagnostics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch diagnostics");
  return res.json();
}

async function createRisco(clinicId: string, data: object): Promise<Risk> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/clinics/${clinicId}/risks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create");
  return res.json();
}

async function updateRisco(id: string, data: object): Promise<Risk> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/risks/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update");
  return res.json();
}

async function resolveLatestDiagnostic(clinicId: string): Promise<string> {
  const token = getStoredToken();
  const headers = { Authorization: `Bearer ${token}` };

  const listRes = await fetch(`${BASE}/api/clinics/${clinicId}/diagnostics`, { headers });
  if (!listRes.ok) throw new Error("Não foi possível carregar os diagnósticos.");
  const list: {
    id: string;
    status: string;
    concluidoEm: string | null;
    iniciadoEm: string;
    progresso?: { completo?: boolean } | null;
  }[] = await listRes.json();

  const concluidos = Array.isArray(list) ? list.filter(d => d.status === "concluido") : [];
  if (concluidos.length === 0) {
    // Distingue "não existe diagnóstico concluído por falta de respostas" de
    // "existe um 100% respondido, mas ainda não concluído" para dar uma
    // mensagem mais útil ao usuário.
    const respondidoNaoConcluido = Array.isArray(list)
      ? list.some((d) => d.status === "em_andamento" && d.progresso?.completo)
      : false;
    throw new Error(respondidoNaoConcluido ? "NEEDS_CONCLUSION" : "NO_DIAGNOSTIC");
  }
  const chosen = [...concluidos].sort((a, b) => {
    const aDate = new Date(a.concluidoEm ?? a.iniciadoEm).getTime();
    const bDate = new Date(b.concluidoEm ?? b.iniciadoEm).getTime();
    return bDate - aDate;
  })[0];
  return chosen.id;
}

function getCellColor(prob: number, impact: number): string {
  const sev = prob * impact;
  if (sev <= 6) return "bg-green-100 hover:bg-green-200";
  if (sev <= 14) return "bg-yellow-100 hover:bg-yellow-200";
  return "bg-red-100 hover:bg-red-200";
}

function getCellBorder(prob: number, impact: number): string {
  const sev = prob * impact;
  if (sev <= 6) return "border-green-200";
  if (sev <= 14) return "border-yellow-200";
  return "border-red-200";
}

function getSeverityLabel(sev: number): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (sev <= 6) return { label: "Baixo", variant: "outline" };
  if (sev <= 14) return { label: "Médio", variant: "secondary" };
  return { label: "Alto", variant: "destructive" };
}

const DATE_TIME_FMT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DATE_FMT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

type RiskGeneration = {
  diagnosticoId: string;
  generatedAt: string;
  count: number;
  versao: number | null;
  concluidoEm: string | null;
};

function computeGenerations(risks: Risk[], diagnostics: DiagnosticSummary[]): RiskGeneration[] {
  const diagById = new Map(diagnostics.map((d) => [d.id, d]));
  const groups = new Map<string, { generatedAt: string; count: number }>();
  for (const r of risks) {
    if (r.origem !== "diagnostico" || !r.diagnosticoId) continue;
    const prev = groups.get(r.diagnosticoId);
    if (!prev) {
      groups.set(r.diagnosticoId, { generatedAt: r.createdAt, count: 1 });
    } else {
      prev.count += 1;
      if (new Date(r.createdAt).getTime() > new Date(prev.generatedAt).getTime()) {
        prev.generatedAt = r.createdAt;
      }
    }
  }
  return [...groups.entries()]
    .map(([diagnosticoId, g]) => {
      const diag = diagById.get(diagnosticoId);
      return {
        diagnosticoId,
        generatedAt: g.generatedAt,
        count: g.count,
        versao: diag?.versao ?? null,
        concluidoEm: diag?.concluidoEm ?? null,
      };
    })
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
}

export default function RiscosPage({ embedded = false }: { embedded?: boolean }) {
  const params = useParams<{ clinicId: string }>();
  const clinicId = params.clinicId;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentRole();
  const isSuperAdmin = currentUser?.role === "super_admin";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [justifyDialog, setJustifyDialog] = useState<{ riskId: string; text: string } | null>(null);
  const [expandedRisk, setExpandedRisk] = useState<string | null>(null);
  const [hoveredRisk, setHoveredRisk] = useState<string | null>(null);
  const [highlightedRisk, setHighlightedRisk] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: "",
    descricao: "",
    pilarSlug: "",
    probabilidade: 3,
    impacto: 3,
    responsavel: "",
    acoesMitigadoras: "",
  });

  const { data: riscos = [], isLoading } = useQuery({
    queryKey: ["riscos", clinicId],
    queryFn: () => fetchRiscos(clinicId!),
    enabled: !!clinicId,
    refetchInterval: (query) => {
      if (query.state.status === "error") return false;
      return 7000;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const { data: diagnostics = [] } = useQuery({
    queryKey: ["riscos-diagnostics", clinicId],
    queryFn: () => fetchDiagnostics(clinicId!),
    enabled: !!clinicId,
  });

  const createMut = useMutation({
    mutationFn: (data: object) => createRisco(clinicId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["riscos", clinicId] });
      setDialogOpen(false);
      setForm({ nome: "", descricao: "", pilarSlug: "", probabilidade: 3, impacto: 3, responsavel: "", acoesMitigadoras: "" });
      toast({ title: "Risco adicionado" });
    },
    onError: () => toast({ variant: "destructive", title: "Erro ao salvar risco" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => updateRisco(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["riscos", clinicId] }),
    onError: () => toast({ variant: "destructive", title: "Erro ao atualizar" }),
  });

  if (!clinicId) {
    return <ClinicSelector />;
  }

  const sortedRiscos = [...riscos].sort((a, b) => b.severidade - a.severidade);
  const generations = computeGenerations(riscos, diagnostics);

  const handleSubmit = () => {
    if (!form.nome) return;
    createMut.mutate({
      nome: form.nome,
      descricao: form.descricao || undefined,
      pilarSlug: form.pilarSlug || undefined,
      probabilidade: form.probabilidade,
      impacto: form.impacto,
      responsavel: form.responsavel || undefined,
      acoesMitigadoras: form.acoesMitigadoras || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {!embedded && (
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/riscos/select")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Mapa de Riscos</h1>
              <p className="text-sm text-muted-foreground">Visualize e gerencie os riscos identificados no diagnóstico ICS.</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <GenerateRisksButton
              clinicId={clinicId}
              resolveDiagnosticId={() => resolveLatestDiagnostic(clinicId)}
              onCommitted={() => {
                queryClient.invalidateQueries({ queryKey: ["riscos", clinicId] });
                queryClient.invalidateQueries({ queryKey: ["riscos-diagnostics", clinicId] });
              }}
            />
          )}
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Novo Risco
          </Button>
        </div>
      </div>

      {generations.length > 0 && (
        <div className="rounded-xl border bg-indigo-50/60 border-indigo-200 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
            <History className="h-4 w-4" /> Histórico de geração automática
          </div>
          <ul className="space-y-2">
            {generations.map((g) => (
              <li
                key={g.diagnosticoId}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-indigo-900/90"
              >
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                <span className="font-medium">{g.count} risco(s)</span>
                <span className="text-indigo-900/70">gerados em</span>
                <span className="font-medium">{DATE_TIME_FMT.format(new Date(g.generatedAt))}</span>
                <span className="text-indigo-900/70">a partir do</span>
                <span className="font-medium">
                  {g.versao != null ? `Diagnóstico v${g.versao}` : "diagnóstico"}
                  {g.concluidoEm ? ` (concluído em ${DATE_FMT.format(new Date(g.concluidoEm))})` : ""}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              Ao regenerar a partir de um diagnóstico, os riscos automáticos gerados anteriormente
              desse mesmo diagnóstico são substituídos. Riscos cadastrados manualmente não são afetados.
            </span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-[420px] lg:flex-shrink-0">
            <div className="border rounded-xl overflow-hidden p-4 bg-card">
              <div className="flex items-end gap-2 mb-3">
                <div className="text-xs text-muted-foreground font-medium" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", height: 200 }}>
                  IMPACTO →
                </div>
                <div className="flex-1">
                  <div className="grid grid-cols-5 gap-1">
                    {[5, 4, 3, 2, 1].map(impact => (
                      <div key={impact} className="contents">
                        {[1, 2, 3, 4, 5].map(prob => {
                          const risksInCell = riscos.filter(r => r.probabilidade === prob && r.impacto === impact);
                          return (
                            <div
                              key={`${prob}-${impact}`}
                              className={cn(
                                "aspect-square rounded-md border transition-all relative min-h-[60px] flex flex-wrap items-center justify-center gap-1 p-1",
                                getCellColor(prob, impact),
                                getCellBorder(prob, impact)
                              )}
                            >
                              {risksInCell.map((risk, i) => {
                                const rank = sortedRiscos.findIndex(r => r.id === risk.id) + 1;
                                const isHighlighted = highlightedRisk === risk.id;
                                const isHovered = hoveredRisk === risk.id;
                                return (
                                  <div key={risk.id} className="relative group">
                                    <button
                                      onClick={() => setHighlightedRisk(isHighlighted ? null : risk.id)}
                                      onMouseEnter={() => setHoveredRisk(risk.id)}
                                      onMouseLeave={() => setHoveredRisk(null)}
                                      className={cn(
                                        "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white transition-all shadow-sm",
                                        risk.severidade <= 6 ? "bg-green-600" : risk.severidade <= 14 ? "bg-yellow-500" : "bg-red-600",
                                        isHighlighted ? "ring-2 ring-offset-1 ring-foreground scale-110" : "hover:scale-110"
                                      )}
                                    >
                                      {rank}
                                    </button>
                                    {isHovered && (
                                      <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-popover border rounded-lg shadow-lg p-2 text-xs pointer-events-none">
                                        <div className="font-semibold text-foreground">{risk.nome}</div>
                                        {risk.responsavel && <div className="text-muted-foreground mt-1">Resp: {risk.responsavel}</div>}
                                        <div className="text-muted-foreground">Severidade: {risk.severidade}</div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-5 gap-1 mt-1">
                    {[1, 2, 3, 4, 5].map(p => (
                      <div key={p} className="text-center text-xs text-muted-foreground">{p}</div>
                    ))}
                  </div>
                  <div className="text-center text-xs text-muted-foreground mt-1 font-medium">PROBABILIDADE →</div>
                </div>
              </div>

              <div className="flex gap-4 mt-4 justify-center text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded bg-green-400" /> Baixo (≤6)</div>
                <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded bg-yellow-400" /> Médio (7–14)</div>
                <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded bg-red-400" /> Alto (≥15)</div>
              </div>
            </div>
          </div>

          <div className="w-full flex-1 space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Riscos por Severidade</h3>
            <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
              {sortedRiscos.map((risk, i) => {
                const sev = getSeverityLabel(risk.severidade);
                const isHighlighted = highlightedRisk === risk.id;
                const isExpanded = expandedRisk === risk.id;
                const fromDiag = risk.origem === "diagnostico";
                const hasFonte = !!(risk.perguntasFonte && risk.perguntasFonte.length > 0);
                const hasJustificativa = risk.status === "nao_aceito" && !!risk.statusJustificativa;
                const hasDetail = hasFonte || hasJustificativa || !!risk.acoesMitigadoras || !!risk.descricao;
                return (
                  <div
                    key={risk.id}
                    className={cn(
                      "rounded-lg border transition-all",
                      isHighlighted ? "border-primary bg-primary/5" : "border-border bg-card"
                    )}
                  >
                    <button
                      onClick={() => setHighlightedRisk(isHighlighted ? null : risk.id)}
                      className="w-full text-left p-3 hover:bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-start gap-2">
                        <span className={cn(
                          "h-6 w-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white mt-0.5",
                          risk.severidade <= 6 ? "bg-green-600" : risk.severidade <= 14 ? "bg-yellow-500" : "bg-red-600"
                        )}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm leading-tight">{risk.nome}</div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant={sev.variant} className="text-[10px] px-1.5 py-0">{sev.label}</Badge>
                            <span className="text-[10px] text-muted-foreground">Sev: {risk.severidade}</span>
                            {fromDiag && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium bg-indigo-100 text-indigo-700">
                                <Sparkles className="h-2.5 w-2.5" /> Diagnóstico
                              </span>
                            )}
                            {risk.pilarSlug && (
                              <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", PILAR_COLORS[risk.pilarSlug] ?? "bg-gray-100 text-gray-700")}>
                                {PILARES.find(p => p.slug === risk.pilarSlug)?.nome.split(" ")[0] ?? risk.pilarSlug}
                              </span>
                            )}
                          </div>
                          {fromDiag && risk.nivel === "alto" && (
                            <div className="flex items-center gap-1 text-[10px] text-red-600 mt-1">
                              <ListChecks className="h-3 w-3" /> Card criado no Plano de Ação
                            </div>
                          )}
                          {risk.responsavel && (
                            <div className="text-xs text-muted-foreground mt-1 truncate">{risk.responsavel}</div>
                          )}
                        </div>
                        <Select
                          value={risk.status}
                          onValueChange={(val) => {
                            if (val === "nao_aceito") {
                              setJustifyDialog({ riskId: risk.id, text: risk.statusJustificativa ?? "" });
                            } else {
                              updateMut.mutate({ id: risk.id, data: { status: val, statusJustificativa: null } });
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 w-[116px] text-[11px]" onClick={e => e.stopPropagation()}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="identificado">Identificado</SelectItem>
                            <SelectItem value="em_mitigacao">Em Mitigação</SelectItem>
                            <SelectItem value="mitigado">Mitigado</SelectItem>
                            <SelectItem value="aceito">Aceito</SelectItem>
                            <SelectItem value="nao_aceito">Não aceito</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </button>
                    {hasDetail && (
                      <div className="px-3 pb-2">
                        <button
                          onClick={() => setExpandedRisk(isExpanded ? null : risk.id)}
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          <ChevronDown className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-180")} />
                          {isExpanded ? "Ocultar detalhes" : "Ver detalhes"}
                        </button>
                        {isExpanded && (
                          <div className="mt-2 space-y-3 text-xs">
                            {hasJustificativa && (
                              <div className="rounded-md border border-red-200 bg-red-50 p-2.5">
                                <div className="font-semibold text-red-800 mb-1">Justificativa — Não aceito</div>
                                <p className="text-red-700 whitespace-pre-line leading-relaxed">{risk.statusJustificativa}</p>
                              </div>
                            )}
                            {risk.descricao && (
                              <p className="text-muted-foreground leading-relaxed">{risk.descricao}</p>
                            )}
                            {risk.acoesMitigadoras && (
                              <div>
                                <div className="font-semibold text-foreground mb-1">Ações mitigadoras</div>
                                <p className="text-muted-foreground whitespace-pre-line leading-relaxed">{risk.acoesMitigadoras}</p>
                              </div>
                            )}
                            {hasFonte && (
                              <div>
                                <div className="font-semibold text-foreground mb-1">Respostas do diagnóstico que originaram este risco</div>
                                <ul className="space-y-2">
                                  {risk.perguntasFonte!.map((pf, idx) => (
                                    <li key={idx} className="border-l-2 border-indigo-300 pl-3 py-0.5">
                                      <div className="text-foreground font-medium leading-snug">{pf.pergunta}</div>
                                      <div className="mt-0.5">
                                        <span className="font-semibold text-foreground/70">Resposta: </span>
                                        <span className="text-muted-foreground">{pf.resposta}</span>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {sortedRiscos.length === 0 && (
                <div className="text-center text-muted-foreground py-8 text-sm">
                  Nenhum risco cadastrado. Clique em "+ Novo Risco" para adicionar.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!justifyDialog} onOpenChange={(o) => { if (!o) setJustifyDialog(null); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Justificar "Não aceito"</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium block">
              Justificativa <span className="text-red-600">*</span>
            </label>
            <Textarea
              placeholder="Explique por que este risco não foi aceito..."
              rows={4}
              value={justifyDialog?.text ?? ""}
              onChange={(e) => setJustifyDialog((d) => (d ? { ...d, text: e.target.value } : d))}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              A justificativa é obrigatória ao marcar um risco como "Não aceito".
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJustifyDialog(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                const text = justifyDialog?.text.trim();
                if (!justifyDialog || !text) return;
                updateMut.mutate(
                  { id: justifyDialog.riskId, data: { status: "nao_aceito", statusJustificativa: text } },
                  { onSuccess: () => setJustifyDialog(null) },
                );
              }}
              disabled={!justifyDialog?.text.trim() || updateMut.isPending}
            >
              {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar justificativa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Novo Risco</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome do Risco *</label>
              <Input
                placeholder="Ex: Inadimplência de pacientes"
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Pilar</label>
              <Select value={form.pilarSlug} onValueChange={v => setForm(f => ({ ...f, pilarSlug: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione um pilar" /></SelectTrigger>
                <SelectContent>
                  {PILARES.map(p => <SelectItem key={p.slug} value={p.slug}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Probabilidade: {form.probabilidade}/5</label>
              <Slider
                min={1}
                max={5}
                step={1}
                value={[form.probabilidade]}
                onValueChange={([v]) => setForm(f => ({ ...f, probabilidade: v }))}
                className="py-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground"><span>Improvável</span><span>Muito provável</span></div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Impacto: {form.impacto}/5</label>
              <Slider
                min={1}
                max={5}
                step={1}
                value={[form.impacto]}
                onValueChange={([v]) => setForm(f => ({ ...f, impacto: v }))}
                className="py-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground"><span>Desprezível</span><span>Catastrófico</span></div>
            </div>
            <div className="p-3 rounded-lg border bg-muted/30">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Severidade calculada:</span>
                <Badge variant={getSeverityLabel(form.probabilidade * form.impacto).variant}>
                  {getSeverityLabel(form.probabilidade * form.impacto).label} ({form.probabilidade * form.impacto})
                </Badge>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Responsável</label>
              <Input
                placeholder="Nome do responsável"
                value={form.responsavel}
                onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Ações Mitigadoras</label>
              <Textarea
                placeholder="Descreva as ações para mitigar este risco..."
                rows={3}
                value={form.acoesMitigadoras}
                onChange={e => setForm(f => ({ ...f, acoesMitigadoras: e.target.value }))}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending || !form.nome}>
              {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar Risco
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function ClinicSelector() {
  return (
    <ClinicSelectorList
      title="Mapa de Riscos"
      description="Selecione uma clínica para visualizar os riscos."
      hrefForClinic={(id) => `/riscos/${id}`}
      portalModule="riscos"
    />
  );
}
