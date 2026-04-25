import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getStoredToken } from "@/hooks/use-auth";
import { useListClinics } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, ArrowLeft, Search, ChevronRight, Calendar, GripVertical } from "lucide-react";
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
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

const COLUMNS: { id: string; title: string }[] = [
  { id: "backlog", title: "Backlog" },
  { id: "todo", title: "A Fazer" },
  { id: "doing", title: "Em Andamento" },
  { id: "review", title: "Revisão" },
  { id: "done", title: "Concluído" },
];

const COLUMN_IDS = new Set(COLUMNS.map(c => c.id));

type Action = {
  id: string;
  clinicId: string;
  titulo: string;
  descricao: string | null;
  responsavelNome: string | null;
  prazo: string | null;
  prioridade: string | null;
  pilarSlug: string | null;
  evidencias: string | null;
  coluna: string;
  ordem: number;
  concluidoEm: string | null;
  createdAt: string;
  updatedAt: string;
};

async function fetchAcoes(clinicId: string): Promise<Action[]> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/clinics/${clinicId}/actions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function createAcao(clinicId: string, data: object): Promise<Action> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/clinics/${clinicId}/actions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create");
  return res.json();
}

async function updateAcao(id: string, data: object): Promise<Action> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/actions/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update");
  return res.json();
}

async function deleteAcao(id: string): Promise<void> {
  const token = getStoredToken();
  await fetch(`${BASE}/api/actions/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; barColor: string }> = {
  alta: { label: "Alta", color: "text-red-600", barColor: "bg-red-500" },
  media: { label: "Média", color: "text-yellow-600", barColor: "bg-yellow-500" },
  baixa: { label: "Baixa", color: "text-green-600", barColor: "bg-green-500" },
};

function KanbanCard({ action, onEdit }: { action: Action; onEdit: (a: Action) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: action.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const prio = PRIORITY_CONFIG[action.prioridade ?? "baixa"] ?? PRIORITY_CONFIG.baixa;
  const pilarNome = action.pilarSlug ? PILARES.find(p => p.slug === action.pilarSlug)?.nome : null;
  const pilarColorClass = action.pilarSlug ? (PILAR_COLORS[action.pilarSlug] ?? "bg-gray-100 text-gray-700") : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-card border rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
      onClick={() => onEdit(action)}
    >
      <div className={cn("h-1 rounded-t-lg", prio.barColor)} />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h5 className="font-medium text-sm leading-tight flex-1">{action.titulo}</h5>
          <button
            {...attributes}
            {...listeners}
            className="opacity-0 group-hover:opacity-100 p-1 -mr-1 text-muted-foreground hover:text-foreground transition-opacity touch-none"
            onClick={e => e.stopPropagation()}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        </div>
        {action.descricao && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{action.descricao}</p>
        )}
        <div className="flex flex-col gap-1 mt-2 text-xs text-muted-foreground">
          {action.prazo && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              <span>{new Date(action.prazo + "T12:00:00").toLocaleDateString("pt-BR")}</span>
            </div>
          )}
          {action.responsavelNome && (
            <div className="flex items-center gap-1.5">
              <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-semibold text-primary flex-shrink-0">
                {action.responsavelNome.charAt(0).toUpperCase()}
              </div>
              <span className="truncate">{action.responsavelNome}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <Badge variant="outline" className={cn("text-[9px] px-1 py-0", prio.color)}>
            {prio.label}
          </Badge>
          {pilarNome && pilarColorClass && (
            <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-medium", pilarColorClass)}>
              {pilarNome.split(" ")[0]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DroppableColumn({
  column,
  actions,
  onEdit,
}: {
  column: { id: string; title: string };
  actions: Action[];
  onEdit: (a: Action) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  const COL_HEADER_COLORS: Record<string, string> = {
    backlog: "border-gray-400",
    todo: "border-blue-400",
    doing: "border-yellow-400",
    review: "border-purple-400",
    done: "border-green-400",
  };

  return (
    <div className="flex flex-col min-w-[240px] bg-muted/30 rounded-xl">
      <div className={cn("px-3 py-2.5 border-t-2 rounded-t-xl", COL_HEADER_COLORS[column.id] ?? "border-gray-400")}>
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-sm text-foreground">{column.title}</h4>
          <span className="text-xs bg-muted rounded-full px-2 py-0.5 font-medium">{actions.length}</span>
        </div>
      </div>
      <SortableContext items={actions.map(a => a.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "flex flex-col gap-2 p-2 min-h-[200px] flex-1 rounded-b-xl transition-colors",
            isOver ? "bg-muted/60" : ""
          )}
        >
          {actions.map(action => (
            <KanbanCard key={action.id} action={action} onEdit={onEdit} />
          ))}
          {actions.length === 0 && (
            <div className={cn(
              "flex-1 border-2 border-dashed rounded-lg flex items-center justify-center py-6 transition-colors",
              isOver ? "border-primary/50 bg-primary/5" : "border-muted-foreground/20"
            )}>
              <span className="text-xs text-muted-foreground/50">Solte aqui</span>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

export default function AcaoPage() {
  const params = useParams<{ clinicId: string }>();
  const clinicId = params.clinicId;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<Action | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [filterResponsavel, setFilterResponsavel] = useState("");
  const [filterPilar, setFilterPilar] = useState("all");
  const [filterPrioridade, setFilterPrioridade] = useState("all");

  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    responsavelNome: "",
    prazo: "",
    prioridade: "media" as string,
    pilarSlug: "" as string,
    evidencias: "",
    coluna: "backlog" as string,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const { data: acoes = [], isLoading } = useQuery({
    queryKey: ["acoes", clinicId],
    queryFn: () => fetchAcoes(clinicId!),
    enabled: !!clinicId,
  });

  const createMut = useMutation({
    mutationFn: (data: object) => createAcao(clinicId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["acoes", clinicId] });
      setDialogOpen(false);
      toast({ title: "Ação criada" });
    },
    onError: () => toast({ variant: "destructive", title: "Erro ao salvar" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => updateAcao(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["acoes", clinicId] }),
    onError: () => toast({ variant: "destructive", title: "Erro ao atualizar ação" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAcao(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["acoes", clinicId] });
      setDialogOpen(false);
    },
  });

  if (!clinicId) {
    return <ClinicSelector />;
  }

  const openCreate = () => {
    setEditingAction(null);
    setForm({ titulo: "", descricao: "", responsavelNome: "", prazo: "", prioridade: "media", pilarSlug: "", evidencias: "", coluna: "backlog" });
    setDialogOpen(true);
  };

  const openEdit = (action: Action) => {
    setEditingAction(action);
    setForm({
      titulo: action.titulo,
      descricao: action.descricao ?? "",
      responsavelNome: action.responsavelNome ?? "",
      prazo: action.prazo ?? "",
      prioridade: action.prioridade ?? "media",
      pilarSlug: action.pilarSlug ?? "",
      evidencias: action.evidencias ?? "",
      coluna: action.coluna,
    });
    setDialogOpen(true);
  };

  const cleanForm = (f: typeof form) => ({
    titulo: f.titulo,
    descricao: f.descricao || undefined,
    responsavelNome: f.responsavelNome || undefined,
    prazo: f.prazo || undefined,
    prioridade: f.prioridade || undefined,
    pilarSlug: f.pilarSlug || undefined,
    evidencias: f.evidencias || undefined,
    coluna: f.coluna,
  });

  const handleSubmit = () => {
    const payload = cleanForm(form);
    if (editingAction) {
      updateMut.mutate(
        { id: editingAction.id, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["acoes", clinicId] });
            setDialogOpen(false);
            toast({ title: "Ação atualizada" });
          },
        }
      );
    } else {
      createMut.mutate(payload);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const draggedAction = acoes.find(a => a.id === active.id);
    if (!draggedAction) return;

    let targetColuna: string;
    if (COLUMN_IDS.has(over.id as string)) {
      targetColuna = over.id as string;
    } else {
      const overAction = acoes.find(a => a.id === over.id);
      if (!overAction) return;
      targetColuna = overAction.coluna;
    }

    if (targetColuna !== draggedAction.coluna) {
      updateMut.mutate({ id: draggedAction.id, data: { coluna: targetColuna } });
    }
  };

  const responsaveis = [...new Set(acoes.map(a => a.responsavelNome).filter(Boolean))] as string[];

  const filteredAcoes = acoes.filter(a => {
    if (filterResponsavel && a.responsavelNome !== filterResponsavel) return false;
    if (filterPrioridade !== "all" && a.prioridade !== filterPrioridade) return false;
    if (filterPilar !== "all" && a.pilarSlug !== filterPilar) return false;
    return true;
  });

  const activeAction = activeId ? acoes.find(a => a.id === activeId) : null;
  const activePrio = PRIORITY_CONFIG[activeAction?.prioridade ?? "baixa"] ?? PRIORITY_CONFIG.baixa;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/acao/select")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Plano de Ação — Kanban</h1>
            <p className="text-sm text-muted-foreground">Arraste os cards entre colunas para atualizar o status.</p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Nova Ação
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={filterResponsavel || "all"} onValueChange={v => setFilterResponsavel(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-[160px] text-sm">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos responsáveis</SelectItem>
            {responsaveis.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterPilar} onValueChange={setFilterPilar}>
          <SelectTrigger className="h-8 w-[160px] text-sm">
            <SelectValue placeholder="Pilar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os pilares</SelectItem>
            {PILARES.map(p => <SelectItem key={p.slug} value={p.slug}>{p.nome.split(" ")[0]}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterPrioridade} onValueChange={setFilterPrioridade}>
          <SelectTrigger className="h-8 w-[140px] text-sm">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas prioridades</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
          </SelectContent>
        </Select>

        {(filterResponsavel || filterPrioridade !== "all" || filterPilar !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground"
            onClick={() => { setFilterResponsavel(""); setFilterPilar("all"); setFilterPrioridade("all"); }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {COLUMNS.map(col => (
              <DroppableColumn
                key={col.id}
                column={col}
                actions={filteredAcoes.filter(a => a.coluna === col.id).sort((a, b) => a.ordem - b.ordem)}
                onEdit={openEdit}
              />
            ))}
          </div>

          <DragOverlay>
            {activeAction ? (
              <div className="rotate-2 shadow-xl opacity-95">
                <div className="bg-card border rounded-lg w-60 overflow-hidden">
                  <div className={cn("h-1", activePrio.barColor)} />
                  <div className="p-3">
                    <h5 className="font-medium text-sm">{activeAction.titulo}</h5>
                  </div>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingAction ? "Editar Ação" : "Nova Ação"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Título *</label>
              <Input
                placeholder="Título da ação"
                value={form.titulo}
                onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição</label>
              <Textarea
                placeholder="Detalhe o que precisa ser feito..."
                rows={3}
                value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                className="resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Responsável</label>
                <Input
                  placeholder="Nome do responsável"
                  value={form.responsavelNome}
                  onChange={e => setForm(f => ({ ...f, responsavelNome: e.target.value }))}
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Prioridade</label>
                <Select value={form.prioridade} onValueChange={v => setForm(f => ({ ...f, prioridade: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Pilar</label>
                <Select value={form.pilarSlug || "none"} onValueChange={v => setForm(f => ({ ...f, pilarSlug: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {PILARES.map(p => <SelectItem key={p.slug} value={p.slug}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Evidências / Links</label>
              <Textarea
                placeholder="URLs, referências ou notas de evidência..."
                rows={2}
                value={form.evidencias}
                onChange={e => setForm(f => ({ ...f, evidencias: e.target.value }))}
                className="resize-none"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Coluna</label>
              <Select value={form.coluna} onValueChange={v => setForm(f => ({ ...f, coluna: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLUMNS.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex-row justify-between">
            {editingAction ? (
              <Button
                variant="outline"
                className="text-destructive border-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (confirm("Excluir esta ação?")) deleteMut.mutate(editingAction.id);
                }}
              >
                Excluir
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending || !form.titulo}>
                {(createMut.isPending || updateMut.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </div>
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
        <h1 className="text-2xl font-bold">Plano de Ação — Kanban</h1>
        <p className="text-sm text-muted-foreground">Selecione uma clínica para gerenciar as ações.</p>
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
            <button key={c.id} onClick={() => navigate(`/acao/${c.id}`)}
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
