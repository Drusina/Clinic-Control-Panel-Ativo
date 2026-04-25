import { useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getStoredToken } from "@/hooks/use-auth";
import { useListClinics } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, ArrowLeft, Search, ChevronRight, GitFork, X, Pencil } from "lucide-react";
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
import { cn } from "@/lib/utils";
import ReactFlow, {
  addEdge,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
} from "reactflow";
import "reactflow/dist/style.css";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PILARES = [
  { slug: "estrategia", nome: "Estratégia" },
  { slug: "financeiro", nome: "Financeiro" },
  { slug: "contabil", nome: "Contabilidade" },
  { slug: "marketing", nome: "Marketing" },
  { slug: "operacoes", nome: "Operações" },
  { slug: "pessoas", nome: "Pessoas" },
  { slug: "tecnologia", nome: "Tecnologia" },
  { slug: "compliance", nome: "Compliance" },
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  mapeado: { label: "Mapeado", color: "bg-green-100 text-green-700 border-green-200" },
  em_mapeamento: { label: "Em Mapeamento", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  pendente: { label: "Pendente", color: "bg-gray-100 text-gray-600 border-gray-200" },
};

type Processo = {
  id: string;
  clinicId: string;
  nome: string;
  descricao: string | null;
  status: string;
  responsavel: string | null;
  duracaoMedia: string | null;
  gargalos: string | null;
  pilarSlug: string | null;
  flowNodes: unknown;
  flowEdges: unknown;
  createdAt: string;
};

async function fetchProcessos(clinicId: string): Promise<Processo[]> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/clinics/${clinicId}/processos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function createProcesso(clinicId: string, data: object): Promise<Processo> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/clinics/${clinicId}/processos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create");
  return res.json();
}

async function updateProcesso(id: string, data: object): Promise<Processo> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/processos/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update");
  return res.json();
}

async function deleteProcesso(id: string): Promise<void> {
  const token = getStoredToken();
  await fetch(`${BASE}/api/processos/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

const defaultNodes: Node[] = [
  { id: "1", position: { x: 100, y: 100 }, data: { label: "Início" }, type: "input" },
  { id: "2", position: { x: 300, y: 100 }, data: { label: "Etapa 1" } },
  { id: "3", position: { x: 500, y: 100 }, data: { label: "Fim" }, type: "output" },
];
const defaultEdges: Edge[] = [
  { id: "e1-2", source: "1", target: "2" },
  { id: "e2-3", source: "2", target: "3" },
];

function FlowchartEditor({ processo, onSave, onClose }: {
  processo: Processo;
  onSave: (nodes: Node[], edges: Edge[]) => void;
  onClose: () => void;
}) {
  const existingNodes = Array.isArray(processo.flowNodes) && (processo.flowNodes as Node[]).length > 0
    ? processo.flowNodes as Node[]
    : defaultNodes;
  const existingEdges = Array.isArray(processo.flowEdges) && (processo.flowEdges as Edge[]).length > 0
    ? processo.flowEdges as Edge[]
    : defaultEdges;

  const [nodes, setNodes, onNodesChange] = useNodesState(existingNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(existingEdges);
  const [newLabel, setNewLabel] = useState("");

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const addNode = () => {
    if (!newLabel.trim()) return;
    const newNode: Node = {
      id: `${Date.now()}`,
      position: { x: Math.random() * 300 + 100, y: Math.random() * 200 + 100 },
      data: { label: newLabel.trim() },
    };
    setNodes((nds) => [...nds, newNode]);
    setNewLabel("");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold">Fluxograma — {processo.nome}</h3>
        <div className="flex items-center gap-2">
          <Input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Nome da etapa"
            className="h-8 w-40 text-sm"
            onKeyDown={e => e.key === "Enter" && addNode()}
          />
          <Button size="sm" variant="outline" onClick={addNode}>
            <Plus className="h-3 w-3 mr-1" /> Etapa
          </Button>
          <Button size="sm" onClick={() => onSave(nodes, edges)}>Salvar</Button>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </div>
      <div style={{ height: 500 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  );
}

export default function ProcessosPage() {
  const params = useParams<{ clinicId: string }>();
  const clinicId = params.clinicId;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProcesso, setEditProcesso] = useState<Processo | null>(null);
  const [flowProcesso, setFlowProcesso] = useState<Processo | null>(null);
  const [form, setForm] = useState({
    nome: "",
    descricao: "",
    status: "pendente",
    responsavel: "",
    duracaoMedia: "",
    gargalos: "",
    pilarSlug: "",
  });
  const [editForm, setEditForm] = useState({
    nome: "",
    descricao: "",
    status: "pendente",
    responsavel: "",
    duracaoMedia: "",
    gargalos: "",
    pilarSlug: "",
  });

  const openEdit = (p: Processo) => {
    setEditForm({
      nome: p.nome,
      descricao: p.descricao ?? "",
      status: p.status,
      responsavel: p.responsavel ?? "",
      duracaoMedia: p.duracaoMedia ?? "",
      gargalos: p.gargalos ?? "",
      pilarSlug: p.pilarSlug ?? "",
    });
    setEditProcesso(p);
  };

  const { data: processos = [], isLoading } = useQuery({
    queryKey: ["processos", clinicId],
    queryFn: () => fetchProcessos(clinicId!),
    enabled: !!clinicId,
  });

  const createMut = useMutation({
    mutationFn: (data: object) => createProcesso(clinicId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["processos", clinicId] });
      setDialogOpen(false);
      setForm({ nome: "", descricao: "", status: "pendente", responsavel: "", duracaoMedia: "", gargalos: "", pilarSlug: "" });
      toast({ title: "Processo criado" });
    },
    onError: () => toast({ variant: "destructive", title: "Erro ao criar processo" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => updateProcesso(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["processos", clinicId] });
      setFlowProcesso(null);
      toast({ title: "Fluxograma salvo" });
    },
    onError: () => toast({ variant: "destructive", title: "Erro ao salvar" }),
  });

  const editMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => updateProcesso(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["processos", clinicId] });
      setEditProcesso(null);
      toast({ title: "Processo atualizado" });
    },
    onError: () => toast({ variant: "destructive", title: "Erro ao atualizar processo" }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteProcesso,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["processos", clinicId] }),
  });

  if (!clinicId) return <ClinicSelector />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/processos/select")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Processos</h1>
            <p className="text-sm text-muted-foreground">Mapeamento de processos críticos da clínica</p>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo Processo
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-3">
          {processos.length === 0 && (
            <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
              <GitFork className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum processo cadastrado. Clique em "+ Novo Processo" para começar.</p>
            </div>
          )}
          {processos.map(p => {
            const s = STATUS_MAP[p.status] ?? STATUS_MAP.pendente;
            return (
              <div key={p.id} className="border rounded-xl p-4 bg-card hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{p.nome}</span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", s.color)}>{s.label}</span>
                      {p.pilarSlug && (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                          {PILARES.find(pl => pl.slug === p.pilarSlug)?.nome ?? p.pilarSlug}
                        </span>
                      )}
                    </div>
                    {p.descricao && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{p.descricao}</p>}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                      {p.responsavel && <span>Responsável: <span className="text-foreground font-medium">{p.responsavel}</span></span>}
                      {p.duracaoMedia && <span>Duração média: <span className="text-foreground font-medium">{p.duracaoMedia}</span></span>}
                      {p.gargalos && <span>Gargalos: <span className="text-foreground font-medium">{p.gargalos}</span></span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Select value={p.status} onValueChange={val => updateMut.mutate({ id: p.id, data: { status: val } })}>
                      <SelectTrigger className="h-7 w-[130px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="em_mapeamento">Em Mapeamento</SelectItem>
                        <SelectItem value="mapeado">Mapeado</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                      <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setFlowProcesso(p)}>
                      <GitFork className="h-3 w-3 mr-1" /> Fluxo
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate(p.id)} className="text-destructive hover:text-destructive">
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>Novo Processo</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome *</label>
              <Input placeholder="Ex: Agendamento de consultas" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição</label>
              <Textarea rows={2} className="resize-none" placeholder="Descreva o processo..." value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Status</label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="em_mapeamento">Em Mapeamento</SelectItem>
                    <SelectItem value="mapeado">Mapeado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Pilar</label>
                <Select value={form.pilarSlug} onValueChange={v => setForm(f => ({ ...f, pilarSlug: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {PILARES.map(p => <SelectItem key={p.slug} value={p.slug}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Responsável</label>
              <Input placeholder="Nome do responsável" value={form.responsavel} onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Duração Média</label>
              <Input placeholder="Ex: 20 minutos, 2 dias" value={form.duracaoMedia} onChange={e => setForm(f => ({ ...f, duracaoMedia: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Gargalos Identificados</label>
              <Textarea rows={2} className="resize-none" placeholder="Liste os gargalos principais..." value={form.gargalos} onChange={e => setForm(f => ({ ...f, gargalos: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate(form)} disabled={createMut.isPending || !form.nome}>
              {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Criar Processo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editProcesso} onOpenChange={open => !open && setEditProcesso(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>Editar Processo</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome *</label>
              <Input value={editForm.nome} onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição</label>
              <Textarea rows={2} className="resize-none" value={editForm.descricao} onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Status</label>
                <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="em_mapeamento">Em Mapeamento</SelectItem>
                    <SelectItem value="mapeado">Mapeado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Pilar</label>
                <Select value={editForm.pilarSlug} onValueChange={v => setEditForm(f => ({ ...f, pilarSlug: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {PILARES.map(p => <SelectItem key={p.slug} value={p.slug}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Responsável</label>
              <Input value={editForm.responsavel} onChange={e => setEditForm(f => ({ ...f, responsavel: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Duração Média</label>
              <Input value={editForm.duracaoMedia} onChange={e => setEditForm(f => ({ ...f, duracaoMedia: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Gargalos Identificados</label>
              <Textarea rows={2} className="resize-none" value={editForm.gargalos} onChange={e => setEditForm(f => ({ ...f, gargalos: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProcesso(null)}>Cancelar</Button>
            <Button
              onClick={() => editProcesso && editMut.mutate({ id: editProcesso.id, data: editForm })}
              disabled={editMut.isPending || !editForm.nome}
            >
              {editMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!flowProcesso} onOpenChange={open => !open && setFlowProcesso(null)}>
        <DialogContent className="max-w-4xl p-0">
          {flowProcesso && (
            <FlowchartEditor
              processo={flowProcesso}
              onSave={(nodes, edges) => updateMut.mutate({ id: flowProcesso.id, data: { flowNodes: nodes, flowEdges: edges } })}
              onClose={() => setFlowProcesso(null)}
            />
          )}
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
        <h1 className="text-2xl font-bold">Processos</h1>
        <p className="text-sm text-muted-foreground">Selecione uma clínica para gerenciar os processos.</p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar clínica..." className="pl-9" />
      </div>
      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <button key={c.id} onClick={() => navigate(`/processos/${c.id}`)}
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
