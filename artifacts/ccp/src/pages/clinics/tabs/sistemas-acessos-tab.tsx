import { useState } from "react";
import {
  useListSistemasUso,
  getListSistemasUsoQueryKey,
  useCreateSistemaUso,
  useUpdateSistemaUso,
  useDeleteSistemaUso,
  type SistemaUso,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Plus, Loader2, MoreHorizontal, Server, Mail, Phone, Globe, Users, ShieldAlert,
  Search,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import { useViewMode } from "@/components/view-toggle";
import { SortableTh } from "@/components/sortable-th";
import { useTableSortFilter } from "@/hooks/use-table-sort-filter";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useCadastroPlanilha,
  CadastroToolbar,
  ImportPlanilhaDialog,
} from "@/components/cadastro-list";
import { EmptyState } from "@/components/empty-state";

const COMMON_TIPOS = [
  "Prontuário",
  "Agenda",
  "ERP",
  "Faturamento",
  "Comunicação",
  "Mídia social",
  "E-mail / Drive",
  "Contábil",
  "Pagamento",
  "Site",
  "Planilhas Excel/ICS",
];

const formSchema = z.object({
  nome: z.string().min(1, "Nome obrigatório"),
  fornecedor: z.string().optional(),
  tipo: z.string().optional(),
  site: z.string().optional(),
  responsavelInterno: z.string().optional(),
  emailResponsavel: z.string().email("E-mail inválido").optional().or(z.literal("")),
  telefoneResponsavel: z.string().optional(),
  suporteExterno: z.string().optional(),
  criticidade: z.string().optional(),
  apiDisponivel: z.string().optional(),
  integrado: z.boolean().optional(),
  quemTemAcesso: z.string().optional(),
  observacoes: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

function criticidadeBadgeVariant(c: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (!c) return "outline";
  const k = c.toLowerCase();
  if (k.startsWith("alta")) return "destructive";
  if (k.startsWith("med") || k.startsWith("méd")) return "default";
  if (k.startsWith("baix")) return "secondary";
  return "outline";
}

export default function SistemasAcessosTab({ clinicId }: { clinicId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SistemaUso | null>(null);

  const { data: sistemas, isLoading } = useListSistemasUso(clinicId, {
    query: { enabled: !!clinicId, queryKey: getListSistemasUsoQueryKey(clinicId) },
  });
  const createMut = useCreateSistemaUso();
  const updateMut = useUpdateSistemaUso();
  const deleteMut = useDeleteSistemaUso();

  const sistemasCount = sistemas?.length ?? 0;
  const { mode: viewMode, setMode: setViewMode } = useViewMode("ccp_view_sistemas", sistemasCount);

  const planilha = useCadastroPlanilha({
    clinicId,
    resourcePath: "sistemas-uso",
    defaultFilename: "Sistemas_e_Acessos.xlsx",
    invalidateKey: getListSistemasUsoQueryKey(clinicId),
    exportToastDescription: (n) => `${n} sistema(s) incluído(s).`,
    itemCount: sistemasCount,
  });

  type SistemaSortKey = "nome" | "tipo" | "fornecedor" | "responsavelInterno" | "criticidade" | "apiDisponivel" | "integrado" | "acessosCount";
  const tableData = useTableSortFilter<SistemaUso, SistemaSortKey>(sistemas ?? [], {
    initialSort: { key: "nome", dir: "asc" },
    searchFields: (s) => [s.nome, s.tipo, s.fornecedor, s.responsavelInterno, s.emailResponsavel, s.suporteExterno, s.quemTemAcesso],
    getSortValue: (s, k) => {
      if (k === "integrado") return !!s.integrado;
      if (k === "acessosCount") {
        const txt = s.quemTemAcesso ?? "";
        return txt ? txt.split(/[,;\n]+/).map(t => t.trim()).filter(Boolean).length : 0;
      }
      if (k === "criticidade") {
        const c = (s.criticidade ?? "").toLowerCase();
        if (c.startsWith("alta")) return 3;
        if (c.startsWith("med") || c.startsWith("méd")) return 2;
        if (c.startsWith("baix")) return 1;
        return 0;
      }
      return (s as unknown as Record<string, unknown>)[k] as string | null | undefined;
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: "", fornecedor: "", tipo: "", site: "", responsavelInterno: "",
      emailResponsavel: "", telefoneResponsavel: "", suporteExterno: "",
      criticidade: "", apiDisponivel: "", integrado: false, quemTemAcesso: "",
      observacoes: "",
    },
  });

  const openDialog = (s?: SistemaUso) => {
    if (s) {
      setEditing(s);
      form.reset({
        nome: s.nome,
        fornecedor: s.fornecedor ?? "",
        tipo: s.tipo ?? "",
        site: s.site ?? "",
        responsavelInterno: s.responsavelInterno ?? "",
        emailResponsavel: s.emailResponsavel ?? "",
        telefoneResponsavel: s.telefoneResponsavel ?? "",
        suporteExterno: s.suporteExterno ?? "",
        criticidade: s.criticidade ?? "",
        apiDisponivel: s.apiDisponivel ?? "",
        integrado: s.integrado ?? false,
        quemTemAcesso: s.quemTemAcesso ?? "",
        observacoes: s.observacoes ?? "",
      });
    } else {
      setEditing(null);
      form.reset({
        nome: "", fornecedor: "", tipo: "", site: "", responsavelInterno: "",
        emailResponsavel: "", telefoneResponsavel: "", suporteExterno: "",
        criticidade: "", apiDisponivel: "", integrado: false, quemTemAcesso: "",
        observacoes: "",
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (values: FormValues) => {
    const payload = {
      nome: values.nome,
      fornecedor: values.fornecedor || null,
      tipo: values.tipo || null,
      site: values.site || null,
      responsavelInterno: values.responsavelInterno || null,
      emailResponsavel: values.emailResponsavel || null,
      telefoneResponsavel: values.telefoneResponsavel || null,
      suporteExterno: values.suporteExterno || null,
      criticidade: values.criticidade || null,
      apiDisponivel: values.apiDisponivel || null,
      integrado: values.integrado ?? false,
      quemTemAcesso: values.quemTemAcesso || null,
      observacoes: values.observacoes || null,
    };
    const onError = (err: Error) =>
      toast({ variant: "destructive", title: "Erro ao salvar", description: err.message });
    if (editing) {
      updateMut.mutate(
        { clinicId, sistemaId: editing.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Sistema atualizado" });
            queryClient.invalidateQueries({ queryKey: getListSistemasUsoQueryKey(clinicId) });
            setIsDialogOpen(false);
          },
          onError,
        },
      );
    } else {
      createMut.mutate(
        { clinicId, data: payload as Parameters<typeof createMut.mutate>[0]["data"] },
        {
          onSuccess: () => {
            toast({ title: "Sistema adicionado" });
            queryClient.invalidateQueries({ queryKey: getListSistemasUsoQueryKey(clinicId) });
            setIsDialogOpen(false);
          },
          onError,
        },
      );
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm("Excluir este sistema?")) return;
    deleteMut.mutate(
      { clinicId, sistemaId: id },
      {
        onSuccess: () => {
          toast({ title: "Sistema excluído" });
          queryClient.invalidateQueries({ queryKey: getListSistemasUsoQueryKey(clinicId) });
        },
      },
    );
  };

  if (isLoading) {
    return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-medium">Sistemas e Acessos</h3>
          <p className="text-sm text-muted-foreground">
            Mapeie sistemas em uso (prontuário, agenda, ERP, faturamento, comunicação, mídia social, e-mail, contábil, pagamento, site, planilhas críticas) e quem tem acesso.
          </p>
        </div>
        <CadastroToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onBaixarModelo={() => planilha.downloadXlsx("template")}
          downloading={planilha.downloading}
          onExportar={() => planilha.downloadXlsx("export")}
          exporting={planilha.exporting}
          exportDisabled={!sistemas || sistemas.length === 0}
          exportDisabledTitle="Nenhum sistema para exportar"
          onImportar={planilha.openImport}
          addLabel="Adicionar Sistema"
          onAdicionar={() => openDialog()}
        />
      </div>

      {viewMode === "table" && (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por nome, fornecedor, responsável…"
              value={tableData.search}
              onChange={(e) => tableData.setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTh sortKey="nome" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>Nome</SortableTh>
                  <SortableTh sortKey="tipo" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>Tipo</SortableTh>
                  <SortableTh sortKey="fornecedor" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>Fornecedor</SortableTh>
                  <SortableTh sortKey="responsavelInterno" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>Responsável</SortableTh>
                  <SortableTh sortKey="criticidade" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>Criticidade</SortableTh>
                  <SortableTh sortKey="apiDisponivel" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>API</SortableTh>
                  <SortableTh sortKey="integrado" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>Integrado</SortableTh>
                  <SortableTh sortKey="acessosCount" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>Acessos</SortableTh>
                  <TableHead className="w-[60px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableData.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {sistemasCount === 0 ? "Nenhum sistema cadastrado." : "Nenhum sistema encontrado."}
                    </TableCell>
                  </TableRow>
                ) : (
                  tableData.items.map((s) => {
                    const acessos = (s.quemTemAcesso ?? "").split(/[,;\n]+/).map(t => t.trim()).filter(Boolean).length;
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.nome}</TableCell>
                        <TableCell className="text-muted-foreground">{s.tipo || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{s.fornecedor || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{s.responsavelInterno || "—"}</TableCell>
                        <TableCell>
                          {s.criticidade
                            ? <Badge variant={criticidadeBadgeVariant(s.criticidade)}>{s.criticidade}</Badge>
                            : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{s.apiDisponivel || "—"}</TableCell>
                        <TableCell>
                          {s.integrado
                            ? <Badge variant="secondary">Sim</Badge>
                            : <span className="text-muted-foreground text-xs">Não</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{acessos || "—"}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openDialog(s)}>Editar</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDelete(s.id)} className="text-destructive">Excluir</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {viewMode === "cards" && (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sistemas && sistemas.length > 0 ? (
          sistemas.map((s) => (
            <div key={s.id} className="flex flex-col bg-card border rounded-lg p-5">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Server className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">{s.nome}</h4>
                    <p className="text-xs text-muted-foreground">
                      {[s.tipo, s.fornecedor].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openDialog(s)}>Editar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDelete(s.id)} className="text-destructive">Excluir</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-2 text-sm flex-1">
                {s.responsavelInterno && (
                  <div className="text-xs text-muted-foreground">
                    Responsável interno: <span className="text-foreground">{s.responsavelInterno}</span>
                  </div>
                )}
                {s.emailResponsavel && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> <span className="truncate">{s.emailResponsavel}</span>
                  </div>
                )}
                {s.telefoneResponsavel && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> <span>{s.telefoneResponsavel}</span>
                  </div>
                )}
                {s.site && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Globe className="h-3.5 w-3.5" /> <span className="truncate">{s.site}</span>
                  </div>
                )}
                {s.suporteExterno && (
                  <div className="text-xs text-muted-foreground">
                    Suporte externo: <span className="text-foreground">{s.suporteExterno}</span>
                  </div>
                )}
                {s.quemTemAcesso && (() => {
                  const tokens = s.quemTemAcesso.split(/[,;\n]+/).map(t => t.trim()).filter(Boolean);
                  return (
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground font-medium">
                            {tokens.length} {tokens.length === 1 ? "acesso" : "acessos"}
                          </span>
                        </div>
                        <span className="text-foreground line-clamp-2 block" title={s.quemTemAcesso}>
                          {s.quemTemAcesso}
                        </span>
                      </div>
                    </div>
                  );
                })()}
                {s.observacoes && (
                  <div className="text-xs text-muted-foreground line-clamp-2" title={s.observacoes}>
                    Obs.: <span className="text-foreground">{s.observacoes}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-4 pt-4 border-t flex-wrap">
                {s.criticidade && (
                  <Badge variant={criticidadeBadgeVariant(s.criticidade)}>
                    <ShieldAlert className="h-3 w-3 mr-1" /> {s.criticidade}
                  </Badge>
                )}
                {s.apiDisponivel && <Badge variant="outline">API: {s.apiDisponivel}</Badge>}
                {s.integrado === true && <Badge variant="secondary">Integrado IONEX360</Badge>}
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            className="col-span-full"
            icon={Server}
            title="Nenhum sistema cadastrado"
            description="Mapeie os sistemas em uso manualmente ou importe a planilha modelo para começar."
            action={
              <Button onClick={() => openDialog()}>
                <Plus className="mr-2 h-4 w-4" /> Adicionar Sistema
              </Button>
            }
          />
        )}
      </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Sistema" : "Adicionar Sistema"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do sistema *</FormLabel>
                      <FormControl><Input placeholder="Ex.: Tasy, Doctoralia…" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fornecedor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fornecedor</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tipo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <FormControl>
                        <Input list="sistema-tipos" placeholder="Prontuário, Agenda, ERP…" {...field} />
                      </FormControl>
                      <datalist id="sistema-tipos">
                        {COMMON_TIPOS.map((t) => <option key={t} value={t} />)}
                      </datalist>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="site"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Site / URL</FormLabel>
                      <FormControl><Input placeholder="https://…" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="responsavelInterno"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Responsável interno</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="suporteExterno"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Suporte externo</FormLabel>
                      <FormControl><Input placeholder="Contato do fornecedor" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="emailResponsavel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail do responsável</FormLabel>
                      <FormControl><Input type="email" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="telefoneResponsavel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone / WhatsApp</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="criticidade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Criticidade</FormLabel>
                      <Select value={field.value || ""} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Alta">Alta</SelectItem>
                          <SelectItem value="Média">Média</SelectItem>
                          <SelectItem value="Baixa">Baixa</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="apiDisponivel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API disponível?</FormLabel>
                      <Select value={field.value || ""} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Sim">Sim</SelectItem>
                          <SelectItem value="Não">Não</SelectItem>
                          <SelectItem value="A validar">A validar</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="integrado"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Integrado ao IONEX360?</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Marque se o sistema já está conectado ao IONEX360 via integração ativa.
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="quemTemAcesso"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quem tem acesso</FormLabel>
                    <FormControl><Textarea rows={2} placeholder="Liste pessoas / cargos com acesso" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="observacoes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl><Textarea rows={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="pt-4">
                <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                  {(createMut.isPending || updateMut.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <ImportPlanilhaDialog
        open={planilha.isImportOpen}
        onOpenChange={planilha.setIsImportOpen}
        title="Importar planilha — Sistemas e Acessos"
        description="Envie a planilha modelo preenchida. Sistemas existentes serão atualizados (busca por Nome + Fornecedor + Tipo). Limite: 2MB. Sem disparo automático de convite."
        importing={planilha.importing}
        selectedFile={planilha.selectedFile}
        onFileChange={planilha.handleFilePicked}
        fileInputRef={planilha.fileInputRef}
        importError={planilha.importError}
        importSummary={planilha.importSummary}
        onSubmit={planilha.submitImport}
      />
    </div>
  );
}
