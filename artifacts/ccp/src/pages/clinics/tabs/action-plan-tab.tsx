import { useMemo, useState } from "react";
import { 
  useListActions, 
  getListActionsQueryKey, 
  useCreateAction, 
  useUpdateAction, 
  useDeleteAction,
  useListCompromissos,
  getListCompromissosQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Calendar, CalendarClock, User, MoreVertical, ListChecks } from "lucide-react";
import AgendaModule from "@/components/agenda/agenda-module";
import ActionDetail from "@/components/acao/action-detail";
import SuggestedTarefasEditor from "@/components/acao/suggested-tarefas-editor";
import OrigemDiagnosticoBadge from "@/components/acao/origem-diagnostico-badge";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Action, ActionColuna } from "@workspace/api-client-react";

const columns: { id: ActionColuna; title: string }[] = [
  { id: "backlog", title: "Backlog" },
  { id: "todo", title: "A Fazer" },
  { id: "doing", title: "Em Andamento" },
  { id: "review", title: "Revisão" },
  { id: "done", title: "Concluído" },
];

const formSchema = z.object({
  titulo: z.string().min(2, "Título obrigatório"),
  descricao: z.string().optional(),
  responsavelNome: z.string().optional(),
  dataInicio: z.string().optional(),
  prazo: z.string().optional(),
  prioridade: z.enum(["alta", "media", "baixa"]),
  coluna: z.enum(["backlog", "todo", "doing", "review", "done"]),
});

export default function ActionPlanTab({ clinicId }: { clinicId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<Action | null>(null);

  const [agendaAction, setAgendaAction] = useState<Action | null>(null);
  const [detailAction, setDetailAction] = useState<Action | null>(null);
  const [tarefasSugeridas, setTarefasSugeridas] = useState<string[]>([]);

  const { data: actions, isLoading } = useListActions(clinicId, undefined, {
    query: { enabled: !!clinicId, queryKey: getListActionsQueryKey(clinicId) },
  });

  const compromissoParams = useMemo(
    () => ({ from: new Date().toISOString(), status: "agendado" as const }),
    [],
  );
  const { data: compromissos } = useListCompromissos(clinicId, compromissoParams, {
    query: {
      enabled: !!clinicId,
      queryKey: getListCompromissosQueryKey(clinicId, compromissoParams),
    },
  });

  const nextByAction = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of compromissos ?? []) {
      if (!c.acaoId) continue;
      const current = map.get(c.acaoId);
      if (!current || new Date(c.inicio) < new Date(current)) {
        map.set(c.acaoId, c.inicio);
      }
    }
    return map;
  }, [compromissos]);

  const createAction = useCreateAction();
  const updateAction = useUpdateAction();
  const deleteAction = useDeleteAction();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      titulo: "",
      descricao: "",
      responsavelNome: "",
      prazo: "",
      prioridade: "media",
      coluna: "backlog",
    },
  });

  const openDialog = (action?: Action) => {
    if (action) {
      setEditingAction(action);
      form.reset({
        titulo: action.titulo,
        descricao: action.descricao || "",
        responsavelNome: action.responsavelNome || "",
        dataInicio: action.dataInicio ? action.dataInicio.split("T")[0] : "",
        prazo: action.prazo ? action.prazo.split("T")[0] : "",
        prioridade: (action.prioridade as any) || "media",
        coluna: action.coluna,
      });
    } else {
      setEditingAction(null);
      form.reset({
        titulo: "",
        descricao: "",
        responsavelNome: "",
        dataInicio: "",
        prazo: "",
        prioridade: "media",
        coluna: "backlog",
      });
    }
    setTarefasSugeridas([]);
    setIsDialogOpen(true);
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (editingAction) {
      updateAction.mutate(
        { id: editingAction.id, data: values },
        {
          onSuccess: () => {
            toast({ title: "Ação atualizada" });
            queryClient.invalidateQueries({ queryKey: getListActionsQueryKey(clinicId) });
            setIsDialogOpen(false);
          },
          onError: () => toast({ variant: "destructive", title: "Erro ao atualizar" }),
        }
      );
    } else {
      const sugeridas = tarefasSugeridas.map((t) => t.trim()).filter(Boolean);
      createAction.mutate(
        {
          clinicId,
          data: { ...values, tarefasSugeridas: sugeridas.length ? sugeridas : undefined } as any,
        },
        {
          onSuccess: () => {
            toast({ title: "Ação criada" });
            queryClient.invalidateQueries({ queryKey: getListActionsQueryKey(clinicId) });
            setIsDialogOpen(false);
          },
          onError: () => toast({ variant: "destructive", title: "Erro ao criar" }),
        }
      );
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Deseja realmente excluir esta ação?")) {
      deleteAction.mutate(
        { id },
        {
          onSuccess: () => {
            toast({ title: "Ação excluída" });
            queryClient.invalidateQueries({ queryKey: getListActionsQueryKey(clinicId) });
          },
        }
      );
    }
  };

  const moveAction = (id: string, novaColuna: ActionColuna) => {
    updateAction.mutate(
      { id, data: { coluna: novaColuna } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListActionsQueryKey(clinicId) });
        }
      }
    );
  };

  if (isLoading) {
    return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'alta': return 'destructive';
      case 'media': return 'secondary';
      case 'baixa': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Plano de Ação</h3>
          <p className="text-sm text-muted-foreground">Gerencie as tarefas de implantação e acompanhamento.</p>
        </div>
        <Button onClick={() => openDialog()}>
          <Plus className="mr-2 h-4 w-4" /> Nova Ação
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div key={col.id} className="flex flex-col min-w-[250px] bg-muted/30 rounded-lg p-3">
            <h4 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wider px-1">
              {col.title} <span className="ml-1 text-xs opacity-70">({actions?.filter(a => a.coluna === col.id).length || 0})</span>
            </h4>
            <div className="flex flex-col gap-3 flex-1">
              {actions?.filter((a) => a.coluna === col.id).map((action) => (
                <div key={action.id} className="bg-card border rounded-md p-3 shadow-sm group hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-2">
                    <Badge variant={getPriorityColor(action.prioridade || 'baixa') as any} className="text-[10px] px-1.5 py-0">
                      {action.prioridade || 'baixa'}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100">
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openDialog(action)}>Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAgendaAction(action)}>
                          Agendar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(action.id)} className="text-destructive">
                          Excluir
                        </DropdownMenuItem>
                        {columns.map(c => 
                          c.id !== col.id && (
                            <DropdownMenuItem key={c.id} onClick={() => moveAction(action.id, c.id)}>
                              Mover para {c.title}
                            </DropdownMenuItem>
                          )
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailAction(action)}
                    className="block text-left w-full font-medium text-sm leading-tight mb-2 hover:text-primary transition-colors"
                  >
                    {action.titulo}
                  </button>
                  <div className="flex flex-col gap-1.5 mt-3 text-xs text-muted-foreground">
                    {action.prazo && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" /> {new Date(action.prazo).toLocaleDateString('pt-BR')}
                      </div>
                    )}
                    {action.responsavelNome && (
                      <div className="flex items-center gap-1.5 truncate">
                        <User className="h-3 w-3 shrink-0" /> <span className="truncate">{action.responsavelNome}</span>
                      </div>
                    )}
                    {(action.tarefasTotal ?? 0) > 0 && (
                      <div className="flex items-center gap-1.5">
                        <ListChecks className="h-3 w-3 shrink-0" />
                        <span>
                          {action.tarefasConcluidas ?? 0}/{action.tarefasTotal} tarefas
                        </span>
                      </div>
                    )}
                    {action.origemDiagnostico && (
                      <OrigemDiagnosticoBadge origem={action.origemDiagnostico} />
                    )}
                    {nextByAction.get(action.id) && (
                      <button
                        type="button"
                        onClick={() => setAgendaAction(action)}
                        className="flex items-center gap-1.5 text-primary hover:underline"
                        data-testid={`acao-proximo-compromisso-${action.id}`}
                      >
                        <CalendarClock className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {new Date(nextByAction.get(action.id)!).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {actions?.filter((a) => a.coluna === col.id).length === 0 && (
                <div className="text-xs text-center text-muted-foreground/50 py-4 border-2 border-dashed border-muted-foreground/20 rounded-md">
                  Vazio
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingAction ? "Editar Ação" : "Nova Ação"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="titulo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="descricao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl><Textarea {...field} className="resize-none" rows={3} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="responsavelNome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Responsável</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dataInicio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de Início</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="prazo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prazo</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="prioridade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prioridade</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="baixa">Baixa</SelectItem>
                          <SelectItem value="media">Média</SelectItem>
                          <SelectItem value="alta">Alta</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="coluna"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Coluna</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="backlog">Backlog</SelectItem>
                          <SelectItem value="todo">A Fazer</SelectItem>
                          <SelectItem value="doing">Em Andamento</SelectItem>
                          <SelectItem value="review">Revisão</SelectItem>
                          <SelectItem value="done">Concluído</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {!editingAction && (
                <SuggestedTarefasEditor
                  clinicId={clinicId}
                  titulo={form.watch("titulo")}
                  descricao={form.watch("descricao")}
                  value={tarefasSugeridas}
                  onChange={setTarefasSugeridas}
                />
              )}
              <DialogFooter className="pt-4">
                <Button type="submit" disabled={createAction.isPending || updateAction.isPending}>
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!agendaAction} onOpenChange={(open) => !open && setAgendaAction(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agenda — {agendaAction?.titulo}</DialogTitle>
          </DialogHeader>
          {agendaAction && (
            <AgendaModule clinicId={clinicId} filterAcaoId={agendaAction.id} embedded />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailAction} onOpenChange={(open) => !open && setDetailAction(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detailAction?.titulo}</DialogTitle>
          </DialogHeader>
          {detailAction && (
            <ActionDetail
              actionId={detailAction.id}
              clinicId={clinicId}
              onEdit={() => {
                const a = detailAction;
                setDetailAction(null);
                openDialog(a);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
