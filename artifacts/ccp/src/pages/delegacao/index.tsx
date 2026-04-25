import { useState, useEffect, useRef } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getStoredToken } from "@/hooks/use-auth";
import { useListClinics, useListTeam } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Loader2, ChevronDown, ChevronRight, Plus, RefreshCw, AlertTriangle, CheckCircle2, Clock, UserX, UserCheck, ArrowLeft, Search } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PILARES = [
  { slug: "estrategia", nome: "Estratégia e Governança", ordem: 1, questaoTotal: 15 },
  { slug: "financeiro", nome: "Financeiro e Fluxo de Caixa", ordem: 2, questaoTotal: 12 },
  { slug: "contabil", nome: "Contabilidade e Fiscal", ordem: 3, questaoTotal: 10 },
  { slug: "marketing", nome: "Vendas, Marketing e Captação", ordem: 4, questaoTotal: 13 },
  { slug: "operacoes", nome: "Processos Operacionais", ordem: 5, questaoTotal: 14 },
  { slug: "pessoas", nome: "Gestão de Pessoas e Cultura", ordem: 6, questaoTotal: 11 },
  { slug: "tecnologia", nome: "Tecnologia e Sistemas", ordem: 7, questaoTotal: 10 },
  { slug: "compliance", nome: "Compliance e Regulamentação", ordem: 8, questaoTotal: 8 },
];

type Delegacao = {
  id: string;
  clinicId: string;
  pilarSlug: string;
  pilarNome: string;
  nivel: number;
  responsavelNome: string | null;
  responsavelEmail: string | null;
  prazo: string | null;
  status: string;
  questaoInicio: number | null;
  questaoFim: number | null;
  parentId: string | null;
  observacoes: string | null;
};

async function fetchDelegacoes(clinicId: string): Promise<Delegacao[]> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/clinics/${clinicId}/delegacoes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function createDelegacao(clinicId: string, data: object): Promise<Delegacao> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/clinics/${clinicId}/delegacoes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create");
  return res.json();
}

async function updateDelegacao(id: string, data: object): Promise<Delegacao> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/delegacoes/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update");
  return res.json();
}

async function deleteDelegacao(id: string): Promise<void> {
  const token = getStoredToken();
  await fetch(`${BASE}/api/delegacoes/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  nao_delegado: { label: "Não delegado", variant: "outline", icon: <UserX className="h-3 w-3" /> },
  pendente: { label: "Pendente", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  andamento: { label: "Em andamento", variant: "default", icon: <RefreshCw className="h-3 w-3" /> },
  concluido: { label: "Concluído", variant: "default", icon: <CheckCircle2 className="h-3 w-3" /> },
  atrasado: { label: "Atrasado", variant: "destructive", icon: <AlertTriangle className="h-3 w-3" /> },
};

const PROGRESS_MAP: Record<string, number> = {
  nao_delegado: 0,
  pendente: 10,
  andamento: 55,
  concluido: 100,
  atrasado: 40,
};

export default function DelegacaoPage() {
  const params = useParams<{ clinicId: string }>();
  const clinicId = params.clinicId;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"delegate" | "subdelegate" | "reatribuir">("delegate");
  const [selectedPilar, setSelectedPilar] = useState<typeof PILARES[0] | null>(null);
  const [parentDelegacao, setParentDelegacao] = useState<Delegacao | null>(null);
  const [reatribuirId, setReatribuirId] = useState<string | null>(null);

  const [form, setForm] = useState({
    responsavelNome: "",
    responsavelEmail: "",
    prazo: "",
    status: "",
    questaoInicio: "",
    questaoFim: "",
    observacoes: "",
  });

  const { data: clinicData } = useListClinics({ pageSize: 1 });

  const { data: delegacoes = [], isLoading } = useQuery({
    queryKey: ["delegacoes", clinicId],
    queryFn: () => fetchDelegacoes(clinicId!),
    enabled: !!clinicId,
  });

  const { data: teamData } = useListTeam(clinicId!, {
    query: { enabled: !!clinicId, queryKey: ["team", clinicId] },
  });
  const team = teamData ?? [];

  const createMut = useMutation({
    mutationFn: (data: object) => createDelegacao(clinicId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delegacoes", clinicId] });
      setDialogOpen(false);
      toast({ title: dialogMode === "delegate" ? "Pilar delegado com sucesso" : "Sub-delegação criada" });
    },
    onError: () => toast({ variant: "destructive", title: "Erro ao salvar delegação" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => updateDelegacao(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData<Delegacao[]>(["delegacoes", clinicId], (old) => {
        if (!old) return old;
        return old.map(d => d.id === updated.id ? updated : d);
      });
    },
    onError: () => toast({ variant: "destructive", title: "Erro ao atualizar" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDelegacao(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["delegacoes", clinicId] }),
  });

  const seedMut = useMutation({
    mutationFn: async () => {
      const token = getStoredToken();
      const res = await fetch(`${BASE}/api/clinics/${clinicId}/delegacoes/seed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Seed failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["delegacoes", clinicId] });
      if (data.created > 0) toast({ title: `${data.created} pilares ICS inicializados automaticamente` });
    },
    onError: () => toast({ variant: "destructive", title: "Erro ao inicializar pilares" }),
  });

  const autoSeeded = useRef(false);
  useEffect(() => {
    if (!isLoading && delegacoes.length === 0 && clinicId && !autoSeeded.current) {
      autoSeeded.current = true;
      seedMut.mutate();
    }
  }, [isLoading, delegacoes.length, clinicId]);

  if (!clinicId) {
    return <ClinicSelector />;
  }

  const toggleRow = (slug: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const openDelegate = (pilar: typeof PILARES[0]) => {
    setSelectedPilar(pilar);
    setParentDelegacao(null);
    setDialogMode("delegate");
    setForm({ responsavelNome: "", responsavelEmail: "", prazo: "", status: "", questaoInicio: "", questaoFim: "", observacoes: "" });
    setDialogOpen(true);
  };

  const openReatribuir = (pilar: typeof PILARES[0], existing: Delegacao) => {
    setSelectedPilar(pilar);
    setParentDelegacao(null);
    setReatribuirId(existing.id);
    setDialogMode("reatribuir");
    setForm({
      responsavelNome: existing.responsavelNome ?? "",
      responsavelEmail: existing.responsavelEmail ?? "",
      prazo: existing.prazo ?? "",
      status: existing.status,
      observacoes: existing.observacoes ?? "",
      questaoInicio: existing.questaoInicio != null ? String(existing.questaoInicio) : "",
      questaoFim: existing.questaoFim != null ? String(existing.questaoFim) : "",
    });
    setDialogOpen(true);
  };

  const openSubdelegate = (pilar: typeof PILARES[0], parent: Delegacao) => {
    setSelectedPilar(pilar);
    setParentDelegacao(parent);
    setDialogMode("subdelegate");
    setForm({ responsavelNome: "", responsavelEmail: "", prazo: "", status: "", questaoInicio: "", questaoFim: "", observacoes: "" });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!selectedPilar) return;

    if (dialogMode === "reatribuir" && reatribuirId) {
      updateMut.mutate(
        {
          id: reatribuirId,
          data: {
            responsavelNome: form.responsavelNome || undefined,
            responsavelEmail: form.responsavelEmail || undefined,
            prazo: form.prazo || undefined,
            observacoes: form.observacoes || undefined,
          },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["delegacoes", clinicId] });
            setDialogOpen(false);
            toast({ title: "Responsável reatribuído com sucesso" });
          },
        }
      );
      return;
    }

    const payload: Record<string, unknown> = {
      pilarSlug: selectedPilar.slug,
      pilarNome: selectedPilar.nome,
      nivel: dialogMode === "delegate" ? 1 : 2,
      responsavelNome: form.responsavelNome || undefined,
      responsavelEmail: form.responsavelEmail || undefined,
      prazo: form.prazo || undefined,
      status: "pendente",
      questaoInicio: form.questaoInicio ? parseInt(form.questaoInicio) : undefined,
      questaoFim: form.questaoFim ? parseInt(form.questaoFim) : undefined,
      parentId: parentDelegacao?.id ?? undefined,
      observacoes: form.observacoes || undefined,
    };
    createMut.mutate(payload);
  };

  const pilaresWithDelegacoes = PILARES.map(pilar => {
    const n1 = delegacoes.find(d => d.pilarSlug === pilar.slug && d.nivel === 1);
    const n2s = delegacoes.filter(d => d.pilarSlug === pilar.slug && d.nivel === 2);
    return { ...pilar, n1, n2s };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/delegacao/select")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Delegação de Pilares</h1>
          <p className="text-sm text-muted-foreground">Gerencie os responsáveis por cada pilar do diagnóstico ICS.</p>
        </div>
      </div>

      {!isLoading && delegacoes.length === 0 && !seedMut.isPending && !seedMut.isSuccess && (
        <div className="border rounded-lg p-6 bg-muted/30 flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <div>
            <p className="font-semibold">Nenhuma delegação configurada</p>
            <p className="text-sm text-muted-foreground mt-1">
              Inicialize os 7 pilares ICS para começar a delegar responsabilidades (o pilar Compliance pode ser delegado separadamente).
            </p>
          </div>
          <Button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
            {seedMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Inicializar Pilares ICS
          </Button>
        </div>
      )}
      {seedMut.isPending && (
        <div className="flex justify-center py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Inicializando pilares ICS...
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-8"></th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pilar</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Responsável (N1)</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Progresso</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Prazo</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pilaresWithDelegacoes.map(pilar => {
                const isExpanded = expandedRows.has(pilar.slug);
                const status = pilar.n1?.status ?? "nao_delegado";
                const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.nao_delegado;
                const progress = PROGRESS_MAP[status] ?? 0;

                return (
                  <>
                    <tr key={pilar.slug} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        {pilar.n2s.length > 0 ? (
                          <button
                            onClick={() => toggleRow(pilar.slug)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        ) : <span className="w-4 h-4 inline-block" />}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{pilar.nome}</div>
                        <div className="text-xs text-muted-foreground">{pilar.questaoTotal} perguntas</div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {pilar.n1?.responsavelNome ? (
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                              {pilar.n1.responsavelNome.charAt(0)}
                            </div>
                            <span>{pilar.n1.responsavelNome}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic text-xs">Não delegado</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <Progress value={progress} className="h-2 w-24" />
                          <span className="text-xs text-muted-foreground">{progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge variant={statusCfg.variant} className="gap-1 text-xs">
                          {statusCfg.icon}
                          {statusCfg.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                        {pilar.n1?.prazo
                          ? new Date(pilar.n1.prazo).toLocaleDateString("pt-BR")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!pilar.n1 ? (
                            <Button size="sm" variant="outline" onClick={() => openDelegate(pilar)}>
                              <UserCheck className="h-3 w-3 mr-1" /> Delegar
                            </Button>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => openReatribuir(pilar, pilar.n1!)}>
                                <UserCheck className="h-3 w-3 mr-1" /> Reatribuir
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => openSubdelegate(pilar, pilar.n1!)}>
                                <Plus className="h-3 w-3 mr-1" /> Sub-delegar
                              </Button>
                              <Select
                                value={pilar.n1.status}
                                onValueChange={(val) => updateMut.mutate({ id: pilar.n1!.id, data: { status: val } })}
                              >
                                <SelectTrigger className="h-7 w-[110px] text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pendente">Pendente</SelectItem>
                                  <SelectItem value="andamento">Em andamento</SelectItem>
                                  <SelectItem value="concluido">Concluído</SelectItem>
                                  <SelectItem value="atrasado">Atrasado</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (confirm("Remover delegação?")) deleteMut.mutate(pilar.n1!.id);
                                }}
                              >
                                Remover
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {isExpanded && pilar.n2s.map(n2 => (
                      <tr key={n2.id} className="bg-muted/20">
                        <td className="px-4 py-2"></td>
                        <td className="px-4 py-2 pl-10 text-xs text-muted-foreground" colSpan={2}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{n2.responsavelNome ?? "—"}</span>
                            {n2.questaoInicio && n2.questaoFim && (
                              <span className="text-muted-foreground">Perguntas {n2.questaoInicio}–{n2.questaoFim}</span>
                            )}
                          </div>
                          {n2.responsavelEmail && <div className="text-muted-foreground">{n2.responsavelEmail}</div>}
                        </td>
                        <td className="px-4 py-2 hidden lg:table-cell"></td>
                        <td className="px-4 py-2 hidden md:table-cell">
                          <Badge variant={STATUS_CONFIG[n2.status]?.variant ?? "outline"} className="text-[10px] gap-1">
                            {STATUS_CONFIG[n2.status]?.icon}
                            {STATUS_CONFIG[n2.status]?.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 hidden lg:table-cell text-xs text-muted-foreground">
                          {n2.prazo ? new Date(n2.prazo).toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive text-xs"
                            onClick={() => deleteMut.mutate(n2.id)}
                          >
                            Remover
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "delegate"
                ? `Delegar — ${selectedPilar?.nome}`
                : dialogMode === "reatribuir"
                ? `Reatribuir — ${selectedPilar?.nome}`
                : `Sub-delegar — ${selectedPilar?.nome}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Responsável</label>
              {team.length > 0 && dialogMode !== "reatribuir" ? (
                <Select value={form.responsavelNome} onValueChange={v => {
                  const member = team.find(m => m.nome === v);
                  setForm(f => ({ ...f, responsavelNome: v, responsavelEmail: member?.email ?? f.responsavelEmail }));
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um membro da equipe" />
                  </SelectTrigger>
                  <SelectContent>
                    {team.map(m => (
                      <SelectItem key={m.id} value={m.nome}>{m.nome} {m.funcao ? `— ${m.funcao}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Nome do novo responsável"
                  value={form.responsavelNome}
                  onChange={e => setForm(f => ({ ...f, responsavelNome: e.target.value }))}
                />
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">E-mail</label>
              <Input
                type="email"
                placeholder="email@clinica.com.br"
                value={form.responsavelEmail}
                onChange={e => setForm(f => ({ ...f, responsavelEmail: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Prazo</label>
              <Input
                type="date"
                value={form.prazo}
                onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))}
              />
            </div>
            {dialogMode === "subdelegate" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Questão inicial</label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="1"
                    value={form.questaoInicio}
                    onChange={e => setForm(f => ({ ...f, questaoInicio: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Questão final</label>
                  <Input
                    type="number"
                    min={1}
                    placeholder={String(selectedPilar?.questaoTotal ?? 10)}
                    value={form.questaoFim}
                    onChange={e => setForm(f => ({ ...f, questaoFim: e.target.value }))}
                  />
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">Observações</label>
              <Input
                placeholder="Instruções adicionais..."
                value={form.observacoes}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending || !form.responsavelNome}>
              {(createMut.isPending || updateMut.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {dialogMode === "reatribuir" ? "Reatribuir" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClinicSelector() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useListClinics({ pageSize: 100 });
  const clinics = data?.data ?? [];
  const filtered = clinics.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    (c.cidade ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Delegação de Pilares</h1>
        <p className="text-sm text-muted-foreground">Selecione uma clínica para gerenciar delegações.</p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar clínica..."
          className="pl-9"
        />
      </div>
      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <button
              key={c.id}
              onClick={() => navigate(`/delegacao/${c.id}`)}
              className="w-full text-left p-4 border rounded-lg hover:bg-muted/50 transition-colors flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{c.nome}</div>
                <div className="text-sm text-muted-foreground">{c.cidade}{c.uf ? `, ${c.uf}` : ""}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Nenhuma clínica encontrada.</p>
          )}
        </div>
      )}
    </div>
  );
}
