import { useMemo, useState } from "react";
import {
  useListCompromissos,
  getListCompromissosQueryKey,
  useCreateCompromisso,
  useUpdateCompromisso,
  useDeleteCompromisso,
  useListActions,
  getListActionsQueryKey,
} from "@workspace/api-client-react";
import type { Compromisso, Action } from "@workspace/api-client-react";
import { TRILHA_ETAPAS } from "@workspace/trilha";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  isSameDay,
  isSameMonth,
  isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  MapPin,
  User,
  Link2,
  Bell,
  CalendarDays,
} from "lucide-react";

type ViewMode = "month" | "week" | "list";

const TIPO_LABELS: Record<string, string> = {
  reuniao: "Reunião",
  tarefa: "Tarefa",
  marco: "Marco",
};

const TIPO_DOT: Record<string, string> = {
  reuniao: "bg-sky-500",
  tarefa: "bg-violet-500",
  marco: "bg-amber-500",
};

const STATUS_LABELS: Record<string, string> = {
  agendado: "Agendado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  agendado: "default",
  concluido: "secondary",
  cancelado: "outline",
};

const LEMBRETE_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "Sem lembrete" },
  { value: "15", label: "15 minutos antes" },
  { value: "30", label: "30 minutos antes" },
  { value: "60", label: "1 hora antes" },
  { value: "120", label: "2 horas antes" },
  { value: "1440", label: "1 dia antes" },
];

const formSchema = z
  .object({
    tipo: z.enum(["reuniao", "tarefa", "marco"]),
    titulo: z.string().min(1, "Título obrigatório"),
    descricao: z.string().optional(),
    diaInteiro: z.boolean(),
    inicio: z.string().min(1, "Início obrigatório"),
    fim: z.string().optional(),
    responsavelNome: z.string().optional(),
    responsavelEmail: z
      .string()
      .optional()
      .refine((v) => !v || /.+@.+\..+/.test(v), "E-mail inválido"),
    local: z.string().optional(),
    status: z.enum(["agendado", "concluido", "cancelado"]),
    lembreteMinutosAntes: z.string(),
    etapaKey: z.string(),
    acaoId: z.string(),
  })
  .refine(
    (v) => {
      if (!v.fim) return true;
      return new Date(toIso(v.fim, v.diaInteiro, true)) >= new Date(toIso(v.inicio, v.diaInteiro));
    },
    { message: "O fim deve ser depois do início", path: ["fim"] },
  );

type FormValues = z.infer<typeof formSchema>;

/** Convert a native input value (date or datetime-local) to an ISO instant. */
function toIso(raw: string, diaInteiro: boolean, endOfDay = false): string {
  if (!raw) return "";
  if (diaInteiro) {
    const datePart = raw.slice(0, 10);
    return new Date(`${datePart}T${endOfDay ? "23:59" : "00:00"}`).toISOString();
  }
  const v = raw.length === 10 ? `${raw}T00:00` : raw;
  return new Date(v).toISOString();
}

/** Convert an ISO instant to a native input value in local time. */
function isoToLocalInput(iso: string | null | undefined, diaInteiro: boolean): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const datePart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (diaInteiro) return datePart;
  return `${datePart}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(c: Compromisso): string {
  const inicio = parseISO(c.inicio);
  if (c.diaInteiro) {
    return format(inicio, "dd 'de' MMM", { locale: ptBR });
  }
  return format(inicio, "dd 'de' MMM, HH:mm", { locale: ptBR });
}

export interface AgendaModuleProps {
  clinicId: string;
  embedded?: boolean;
  /** Restrict the view to a single Trilha stage (used by the Trilha integration). */
  filterEtapaKey?: string;
  /** Restrict the view to a single action-plan item (used by the action card). */
  filterAcaoId?: string;
  /** Prefill the create dialog with a linked action when opened via "Agendar". */
}

export default function AgendaModule({
  clinicId,
  embedded = false,
  filterEtapaKey,
  filterAcaoId,
}: AgendaModuleProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [view, setView] = useState<ViewMode>(filterAcaoId || filterEtapaKey ? "list" : "month");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [tipoFilter, setTipoFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [etapaFilter, setEtapaFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Compromisso | null>(null);

  // Compute the date range fetched for the current view. List view fetches
  // everything from the start of the current month onward.
  const range = useMemo(() => {
    if (view === "month") {
      return {
        from: startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 }),
        to: endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 }),
      };
    }
    if (view === "week") {
      return {
        from: startOfWeek(anchor, { weekStartsOn: 0 }),
        to: endOfWeek(anchor, { weekStartsOn: 0 }),
      };
    }
    return { from: startOfMonth(anchor), to: null as Date | null };
  }, [view, anchor]);

  const params = useMemo(() => {
    const p: Record<string, string> = { from: range.from.toISOString() };
    if (range.to) p.to = range.to.toISOString();
    if (tipoFilter !== "all") p.tipo = tipoFilter;
    if (statusFilter !== "all") p.status = statusFilter;
    if (filterEtapaKey) p.etapaKey = filterEtapaKey;
    else if (etapaFilter !== "all") p.etapaKey = etapaFilter;
    if (filterAcaoId) p.acaoId = filterAcaoId;
    return p;
  }, [range, tipoFilter, statusFilter, etapaFilter, filterEtapaKey, filterAcaoId]);

  const { data: compromissos, isLoading } = useListCompromissos(clinicId, params, {
    query: {
      enabled: !!clinicId,
      queryKey: getListCompromissosQueryKey(clinicId, params),
    },
  });

  const { data: actions } = useListActions(clinicId, undefined, {
    query: { enabled: !!clinicId, queryKey: getListActionsQueryKey(clinicId) },
  });

  const createCompromisso = useCreateCompromisso();
  const updateCompromisso = useUpdateCompromisso();
  const deleteCompromisso = useDeleteCompromisso();

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: [`/api/clinics/${clinicId}/compromissos`],
    });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tipo: "reuniao",
      titulo: "",
      descricao: "",
      diaInteiro: false,
      inicio: "",
      fim: "",
      responsavelNome: "",
      responsavelEmail: "",
      local: "",
      status: "agendado",
      lembreteMinutosAntes: "60",
      etapaKey: filterEtapaKey ?? "none",
      acaoId: filterAcaoId ?? "none",
    },
  });

  const diaInteiro = form.watch("diaInteiro");

  const openDialog = (c?: Compromisso, prefill?: Partial<FormValues>) => {
    if (c) {
      setEditing(c);
      form.reset({
        tipo: c.tipo,
        titulo: c.titulo,
        descricao: c.descricao ?? "",
        diaInteiro: c.diaInteiro,
        inicio: isoToLocalInput(c.inicio, c.diaInteiro),
        fim: isoToLocalInput(c.fim, c.diaInteiro),
        responsavelNome: c.responsavelNome ?? "",
        responsavelEmail: c.responsavelEmail ?? "",
        local: c.local ?? "",
        status: c.status,
        lembreteMinutosAntes:
          c.lembreteMinutosAntes == null ? "none" : String(c.lembreteMinutosAntes),
        etapaKey: c.etapaKey ?? "none",
        acaoId: c.acaoId ?? "none",
      });
    } else {
      setEditing(null);
      form.reset({
        tipo: "reuniao",
        titulo: "",
        descricao: "",
        diaInteiro: false,
        inicio: "",
        fim: "",
        responsavelNome: "",
        responsavelEmail: "",
        local: "",
        status: "agendado",
        lembreteMinutosAntes: "60",
        etapaKey: filterEtapaKey ?? "none",
        acaoId: filterAcaoId ?? "none",
        ...prefill,
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (values: FormValues) => {
    const payload = {
      tipo: values.tipo,
      titulo: values.titulo.trim(),
      descricao: values.descricao?.trim() || null,
      diaInteiro: values.diaInteiro,
      inicio: toIso(values.inicio, values.diaInteiro),
      fim: values.fim ? toIso(values.fim, values.diaInteiro, values.diaInteiro) : null,
      responsavelNome: values.responsavelNome?.trim() || null,
      responsavelEmail: values.responsavelEmail?.trim() || null,
      local: values.local?.trim() || null,
      status: values.status,
      lembreteMinutosAntes:
        values.lembreteMinutosAntes === "none" ? null : Number(values.lembreteMinutosAntes),
      etapaKey: values.etapaKey === "none" ? null : values.etapaKey,
      acaoId: values.acaoId === "none" ? null : values.acaoId,
    };

    if (editing) {
      updateCompromisso.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Compromisso atualizado" });
            invalidate();
            setIsDialogOpen(false);
          },
          onError: () => toast({ variant: "destructive", title: "Erro ao atualizar" }),
        },
      );
    } else {
      createCompromisso.mutate(
        { clinicId, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Compromisso criado" });
            invalidate();
            setIsDialogOpen(false);
          },
          onError: () => toast({ variant: "destructive", title: "Erro ao criar" }),
        },
      );
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm("Deseja realmente excluir este compromisso?")) return;
    deleteCompromisso.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Compromisso excluído" });
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Erro ao excluir" }),
      },
    );
  };

  const handleConcluir = (c: Compromisso) => {
    updateCompromisso.mutate(
      { id: c.id, data: { status: "concluido" } },
      {
        onSuccess: () => {
          toast({ title: "Compromisso concluído" });
          invalidate();
        },
        onError: () => toast({ variant: "destructive", title: "Erro ao concluir" }),
      },
    );
  };

  const items = compromissos ?? [];

  const navLabel = useMemo(() => {
    if (view === "month") return format(anchor, "MMMM 'de' yyyy", { locale: ptBR });
    if (view === "week") {
      const ws = startOfWeek(anchor, { weekStartsOn: 0 });
      const we = endOfWeek(anchor, { weekStartsOn: 0 });
      return `${format(ws, "dd MMM", { locale: ptBR })} – ${format(we, "dd MMM", { locale: ptBR })}`;
    }
    return "Próximos compromissos";
  }, [view, anchor]);

  const goPrev = () =>
    setAnchor((a) => (view === "week" ? subWeeks(a, 1) : subMonths(a, 1)));
  const goNext = () =>
    setAnchor((a) => (view === "week" ? addWeeks(a, 1) : addMonths(a, 1)));
  const goToday = () => setAnchor(new Date());

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-medium">
            <CalendarDays className="h-5 w-5 text-primary" /> Agenda da Clínica
          </h3>
          <p className="text-sm text-muted-foreground">
            Reuniões, tarefas e marcos — com lembretes automáticos.
          </p>
        </div>
        <Button onClick={() => openDialog()} data-testid="btn-novo-compromisso">
          <Plus className="mr-2 h-4 w-4" /> Novo compromisso
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="month">Mês</TabsTrigger>
            <TabsTrigger value="week">Semana</TabsTrigger>
            <TabsTrigger value="list">Lista</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={tipoFilter} onValueChange={setTipoFilter}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="reuniao">Reunião</SelectItem>
              <SelectItem value="tarefa">Tarefa</SelectItem>
              <SelectItem value="marco">Marco</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="agendado">Agendado</SelectItem>
              <SelectItem value="concluido">Concluído</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          {!filterEtapaKey && (
            <Select value={etapaFilter} onValueChange={setEtapaFilter}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="Etapa da Trilha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as etapas</SelectItem>
                {TRILHA_ETAPAS.map((e) => (
                  <SelectItem key={e.key} value={e.key}>
                    {e.ordem}. {e.titulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {view !== "list" && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToday}>
              Hoje
            </Button>
          </div>
          <span className="text-sm font-medium capitalize">{navLabel}</span>
        </div>
      )}

      {isLoading ? (
        <div className="p-8 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
        </div>
      ) : view === "month" ? (
        <MonthView
          anchor={anchor}
          items={items}
          onSelect={(c) => openDialog(c)}
        />
      ) : view === "week" ? (
        <WeekView anchor={anchor} items={items} onSelect={(c) => openDialog(c)} />
      ) : (
        <ListView
          items={items}
          onEdit={(c) => openDialog(c)}
          onDelete={handleDelete}
          onConcluir={handleConcluir}
        />
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar compromisso" : "Novo compromisso"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="tipo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="reuniao">Reunião</SelectItem>
                          <SelectItem value="tarefa">Tarefa</SelectItem>
                          <SelectItem value="marco">Marco</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="titulo"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Título</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ex.: Reunião de alinhamento" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="descricao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea {...field} className="resize-none" rows={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="diaInteiro"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="cursor-pointer">Dia inteiro</FormLabel>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="inicio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Início</FormLabel>
                      <FormControl>
                        <Input
                          type={diaInteiro ? "date" : "datetime-local"}
                          value={diaInteiro ? field.value.slice(0, 10) : field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fim"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fim (opcional)</FormLabel>
                      <FormControl>
                        <Input
                          type={diaInteiro ? "date" : "datetime-local"}
                          value={diaInteiro ? (field.value ?? "").slice(0, 10) : field.value ?? ""}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="responsavelNome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Responsável</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="responsavelEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail do responsável</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="para receber lembretes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="local"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Local</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Sala, link da reunião…" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lembreteMinutosAntes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lembrete</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LEMBRETE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="etapaKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Etapa da Trilha (opcional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma</SelectItem>
                          {TRILHA_ETAPAS.map((e) => (
                            <SelectItem key={e.key} value={e.key}>
                              {e.ordem}. {e.titulo}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="acaoId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ação do plano (opcional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma</SelectItem>
                          {(actions ?? []).map((a: Action) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.titulo}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {editing && (
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="agendado">Agendado</SelectItem>
                          <SelectItem value="concluido">Concluído</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <DialogFooter className="gap-2 pt-2">
                {editing && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mr-auto text-destructive"
                    onClick={() => {
                      setIsDialogOpen(false);
                      handleDelete(editing.id);
                    }}
                  >
                    Excluir
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={createCompromisso.isPending || updateCompromisso.isPending}
                >
                  {(createCompromisso.isPending || updateCompromisso.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CompromissoChip({
  c,
  onSelect,
}: {
  c: Compromisso;
  onSelect: (c: Compromisso) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(c)}
      className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] transition-colors hover:bg-muted ${
        c.status === "cancelado" ? "line-through opacity-50" : ""
      }`}
      title={c.titulo}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TIPO_DOT[c.tipo]}`} />
      {!c.diaInteiro && (
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {format(parseISO(c.inicio), "HH:mm")}
        </span>
      )}
      <span className="truncate">{c.titulo}</span>
    </button>
  );
}

function MonthView({
  anchor,
  items,
  onSelect,
}: {
  anchor: Date;
  items: Compromisso[];
  onSelect: (c: Compromisso) => void;
}) {
  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const byDay = useMemo(() => {
    const map = new Map<string, Compromisso[]>();
    for (const c of items) {
      const key = format(parseISO(c.inicio), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return map;
  }, [items]);

  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
        {weekdays.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayItems = (byDay.get(key) ?? []).sort(
            (a, b) => +parseISO(a.inicio) - +parseISO(b.inicio),
          );
          const muted = !isSameMonth(day, anchor);
          return (
            <div
              key={key}
              className={`min-h-[96px] border-b border-r p-1.5 last:border-r-0 ${
                muted ? "bg-muted/20 text-muted-foreground" : ""
              }`}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isToday(day) ? "bg-primary font-semibold text-primary-foreground" : ""
                  }`}
                >
                  {format(day, "d")}
                </span>
              </div>
              <div className="space-y-0.5">
                {dayItems.slice(0, 3).map((c) => (
                  <CompromissoChip key={c.id} c={c} onSelect={onSelect} />
                ))}
                {dayItems.length > 3 && (
                  <div className="px-1 text-[10px] text-muted-foreground">
                    +{dayItems.length - 3} mais
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  anchor,
  items,
  onSelect,
}: {
  anchor: Date;
  items: Compromisso[];
  onSelect: (c: Compromisso) => void;
}) {
  const ws = startOfWeek(anchor, { weekStartsOn: 0 });
  const we = endOfWeek(anchor, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: ws, end: we });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
      {days.map((day) => {
        const dayItems = items
          .filter((c) => isSameDay(parseISO(c.inicio), day))
          .sort((a, b) => +parseISO(a.inicio) - +parseISO(b.inicio));
        return (
          <div key={day.toISOString()} className="rounded-md border bg-card p-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium capitalize text-muted-foreground">
                {format(day, "EEE", { locale: ptBR })}
              </span>
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  isToday(day) ? "bg-primary font-semibold text-primary-foreground" : ""
                }`}
              >
                {format(day, "d")}
              </span>
            </div>
            <div className="space-y-1">
              {dayItems.length > 0 ? (
                dayItems.map((c) => (
                  <CompromissoChip key={c.id} c={c} onSelect={onSelect} />
                ))
              ) : (
                <div className="py-2 text-center text-[11px] text-muted-foreground/60">
                  —
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListView({
  items,
  onEdit,
  onDelete,
  onConcluir,
}: {
  items: Compromisso[];
  onEdit: (c: Compromisso) => void;
  onDelete: (id: string) => void;
  onConcluir: (c: Compromisso) => void;
}) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => +parseISO(a.inicio) - +parseISO(b.inicio)),
    [items],
  );

  if (sorted.length === 0) {
    return (
      <div className="rounded-md border bg-card p-10 text-center text-sm text-muted-foreground">
        Nenhum compromisso no período.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((c) => (
        <div
          key={c.id}
          className={`flex items-start justify-between gap-3 rounded-md border bg-card p-3 ${
            c.status === "cancelado" ? "opacity-60" : ""
          }`}
          data-testid={`compromisso-${c.id}`}
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TIPO_DOT[c.tipo]}`} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`font-medium ${c.status === "cancelado" ? "line-through" : ""}`}
                >
                  {c.titulo}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {TIPO_LABELS[c.tipo]}
                </Badge>
                <Badge variant={STATUS_VARIANT[c.status]} className="text-[10px]">
                  {STATUS_LABELS[c.status]}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" /> {formatWhen(c)}
                </span>
                {c.responsavelNome && (
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" /> {c.responsavelNome}
                  </span>
                )}
                {c.local && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {c.local}
                  </span>
                )}
                {c.lembreteMinutosAntes != null && (
                  <span className="flex items-center gap-1">
                    <Bell className="h-3.5 w-3.5" /> {c.lembreteMinutosAntes}min antes
                  </span>
                )}
                {(c.etapaKey || c.acaoId) && (
                  <span className="flex items-center gap-1">
                    <Link2 className="h-3.5 w-3.5" />
                    {c.etapaKey
                      ? TRILHA_ETAPAS.find((e) => e.key === c.etapaKey)?.titulo ?? "Trilha"
                      : "Ação vinculada"}
                  </span>
                )}
              </div>
              {c.descricao && (
                <p className="mt-1 text-xs text-muted-foreground/80">{c.descricao}</p>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 shrink-0 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(c)}>Editar</DropdownMenuItem>
              {c.status !== "concluido" && (
                <DropdownMenuItem onClick={() => onConcluir(c)}>
                  Marcar concluído
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => onDelete(c.id)}
                className="text-destructive"
              >
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  );
}
