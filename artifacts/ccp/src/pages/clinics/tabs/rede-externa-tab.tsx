import { useState } from "react";
import {
  useListParceirosExternos,
  getListParceirosExternosQueryKey,
  useCreateParceiroExterno,
  useUpdateParceiroExterno,
  useDeleteParceiroExterno,
  type ParceiroExterno,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Plus, Loader2, MoreHorizontal, Building2, Mail, Phone, Globe, FileText,
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

const COMMON_CATEGORIES = [
  "Contador",
  "Jurídico Trabalhista",
  "Jurídico Cível",
  "Marketing",
  "Sistema TI",
  "Manutenção predial",
  "Manutenção de equipamentos",
  "PGRSS",
  "Vigilância sanitária",
  "Seguros",
  "Banco / Maquininha",
];

function formatCnpjCpf(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}

const formSchema = z.object({
  tipo: z.string().min(1, "Categoria obrigatória"),
  nomeEmpresa: z.string().optional(),
  responsavel: z.string().optional(),
  cnpjCpf: z.string().optional(),
  registroProfissional: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  telefone: z.string().optional(),
  site: z.string().optional(),
  temContratoFormal: z.boolean().optional(),
  ondeContrato: z.string().optional(),
  frequenciaContato: z.string().optional(),
  observacoes: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

export default function RedeExternaTab({ clinicId }: { clinicId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ParceiroExterno | null>(null);

  const { data: partners, isLoading } = useListParceirosExternos(clinicId, {
    query: { enabled: !!clinicId, queryKey: getListParceirosExternosQueryKey(clinicId) },
  });
  const createMut = useCreateParceiroExterno();
  const updateMut = useUpdateParceiroExterno();
  const deleteMut = useDeleteParceiroExterno();

  const partnersCount = partners?.length ?? 0;
  const { mode: viewMode, setMode: setViewMode } = useViewMode("ccp_view_rede_externa", partnersCount);

  const planilha = useCadastroPlanilha({
    clinicId,
    resourcePath: "parceiros-externos",
    defaultFilename: "Rede_Externa.xlsx",
    invalidateKey: getListParceirosExternosQueryKey(clinicId),
    exportToastDescription: (n) => `${n} parceiro(s) incluídos.`,
    itemCount: partnersCount,
  });

  type ParceiroSortKey = "nomeEmpresa" | "tipo" | "responsavel" | "email" | "telefone" | "frequenciaContato";
  const tableData = useTableSortFilter<ParceiroExterno, ParceiroSortKey>(partners ?? [], {
    initialSort: { key: "nomeEmpresa", dir: "asc" },
    searchFields: (p) => [p.nomeEmpresa, p.tipo, p.responsavel, p.email, p.telefone, p.cnpjCpf, p.site],
    getSortValue: (p, k) => (p as unknown as Record<string, unknown>)[k] as string | null | undefined,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tipo: "", nomeEmpresa: "", responsavel: "", cnpjCpf: "", registroProfissional: "",
      email: "", telefone: "", site: "", temContratoFormal: false, ondeContrato: "",
      frequenciaContato: "", observacoes: "",
    },
  });

  const openDialog = (p?: ParceiroExterno) => {
    if (p) {
      setEditing(p);
      form.reset({
        tipo: p.tipo,
        nomeEmpresa: p.nomeEmpresa ?? "",
        responsavel: p.responsavel ?? "",
        cnpjCpf: p.cnpjCpf ? formatCnpjCpf(p.cnpjCpf) : "",
        registroProfissional: p.registroProfissional ?? "",
        email: p.email ?? "",
        telefone: p.telefone ?? "",
        site: p.site ?? "",
        temContratoFormal: p.temContratoFormal ?? false,
        ondeContrato: p.ondeContrato ?? "",
        frequenciaContato: p.frequenciaContato ?? "",
        observacoes: p.observacoes ?? "",
      });
    } else {
      setEditing(null);
      form.reset({
        tipo: "", nomeEmpresa: "", responsavel: "", cnpjCpf: "", registroProfissional: "",
        email: "", telefone: "", site: "", temContratoFormal: false, ondeContrato: "",
        frequenciaContato: "", observacoes: "",
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (values: FormValues) => {
    const payload = {
      tipo: values.tipo,
      nomeEmpresa: values.nomeEmpresa || null,
      responsavel: values.responsavel || null,
      cnpjCpf: values.cnpjCpf || null,
      registroProfissional: values.registroProfissional || null,
      email: values.email || null,
      telefone: values.telefone || null,
      site: values.site || null,
      temContratoFormal: values.temContratoFormal ?? null,
      ondeContrato: values.ondeContrato || null,
      frequenciaContato: values.frequenciaContato || null,
      observacoes: values.observacoes || null,
    };
    const onError = (err: Error) =>
      toast({ variant: "destructive", title: "Erro ao salvar", description: err.message });
    if (editing) {
      updateMut.mutate(
        { clinicId, parceiroId: editing.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Parceiro atualizado" });
            queryClient.invalidateQueries({ queryKey: getListParceirosExternosQueryKey(clinicId) });
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
            toast({ title: "Parceiro adicionado" });
            queryClient.invalidateQueries({ queryKey: getListParceirosExternosQueryKey(clinicId) });
            setIsDialogOpen(false);
          },
          onError,
        },
      );
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm("Excluir este parceiro?")) return;
    deleteMut.mutate(
      { clinicId, parceiroId: id },
      {
        onSuccess: () => {
          toast({ title: "Parceiro excluído" });
          queryClient.invalidateQueries({ queryKey: getListParceirosExternosQueryKey(clinicId) });
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
          <h3 className="text-lg font-medium">Rede Externa da Clínica</h3>
          <p className="text-sm text-muted-foreground">
            Cadastre fornecedores e parceiros externos (contador, jurídico, marketing, TI, manutenção, PGRSS, vigilância, seguros, bancos…).
          </p>
        </div>
        <CadastroToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onBaixarModelo={() => planilha.downloadXlsx("template")}
          downloading={planilha.downloading}
          onExportar={() => planilha.downloadXlsx("export")}
          exporting={planilha.exporting}
          exportDisabled={!partners || partners.length === 0}
          exportDisabledTitle="Nenhum parceiro para exportar"
          onImportar={planilha.openImport}
          addLabel="Adicionar Parceiro"
          onAdicionar={() => openDialog()}
        />
      </div>

      {viewMode === "table" && (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por nome, categoria, contato…"
              value={tableData.search}
              onChange={(e) => tableData.setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTh sortKey="nomeEmpresa" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>Nome / Empresa</SortableTh>
                  <SortableTh sortKey="tipo" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>Categoria</SortableTh>
                  <SortableTh sortKey="responsavel" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>Contato</SortableTh>
                  <SortableTh sortKey="email" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>E-mail</SortableTh>
                  <SortableTh sortKey="telefone" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>Telefone</SortableTh>
                  <SortableTh sortKey="frequenciaContato" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>Frequência</SortableTh>
                  <TableHead>Contrato</TableHead>
                  <TableHead className="w-[60px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableData.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {partnersCount === 0 ? "Nenhum parceiro cadastrado." : "Nenhum parceiro encontrado."}
                    </TableCell>
                  </TableRow>
                ) : (
                  tableData.items.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nomeEmpresa || "(sem nome)"}</TableCell>
                      <TableCell className="text-muted-foreground">{p.tipo}</TableCell>
                      <TableCell className="text-muted-foreground">{p.responsavel || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{p.email || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{p.telefone || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{p.frequenciaContato || "—"}</TableCell>
                      <TableCell>
                        {p.temContratoFormal === true && <Badge variant="secondary">Formal</Badge>}
                        {p.temContratoFormal === false && <Badge variant="outline">Sem contrato</Badge>}
                        {p.temContratoFormal == null && <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDialog(p)}>Editar</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(p.id)} className="text-destructive">Excluir</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {viewMode === "cards" && (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {partners && partners.length > 0 ? (
          partners.map((p) => (
            <div key={p.id} className="flex flex-col bg-card border rounded-lg p-5">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">{p.nomeEmpresa || "(sem nome)"}</h4>
                    <p className="text-xs text-muted-foreground">{p.tipo}</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openDialog(p)}>Editar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDelete(p.id)} className="text-destructive">Excluir</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-2 text-sm flex-1">
                {p.responsavel && (
                  <div className="text-xs text-muted-foreground">
                    Responsável: <span className="text-foreground">{p.responsavel}</span>
                  </div>
                )}
                {p.cnpjCpf && (
                  <div className="text-xs text-muted-foreground">
                    {p.cnpjCpf.length === 14 ? "CNPJ" : p.cnpjCpf.length === 11 ? "CPF" : "Doc"}:{" "}
                    <span className="text-foreground font-mono">{formatCnpjCpf(p.cnpjCpf)}</span>
                  </div>
                )}
                {p.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> <span className="truncate">{p.email}</span>
                  </div>
                )}
                {p.telefone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> <span>{p.telefone}</span>
                  </div>
                )}
                {p.site && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Globe className="h-3.5 w-3.5" /> <span className="truncate">{p.site}</span>
                  </div>
                )}
                {p.frequenciaContato && (
                  <div className="text-xs text-muted-foreground">
                    Frequência: <span className="text-foreground">{p.frequenciaContato}</span>
                  </div>
                )}
                {p.ondeContrato && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" /> <span className="truncate">{p.ondeContrato}</span>
                  </div>
                )}
                {p.observacoes && (
                  <div className="text-xs text-muted-foreground line-clamp-2" title={p.observacoes}>
                    Obs.: <span className="text-foreground">{p.observacoes}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-4 pt-4 border-t flex-wrap">
                {p.registroProfissional && <Badge variant="outline">{p.registroProfissional}</Badge>}
                {p.temContratoFormal === true && <Badge variant="secondary">Contrato formal</Badge>}
                {p.temContratoFormal === false && <Badge variant="outline">Sem contrato</Badge>}
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            className="col-span-full"
            icon={Building2}
            title="Nenhum parceiro cadastrado"
            description="Cadastre fornecedores e parceiros externos manualmente ou importe a planilha modelo."
            action={
              <Button onClick={() => openDialog()}>
                <Plus className="mr-2 h-4 w-4" /> Adicionar Parceiro
              </Button>
            }
          />
        )}
      </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Parceiro" : "Adicionar Parceiro"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria *</FormLabel>
                    <FormControl>
                      <Input list="parceiro-categorias" placeholder="Ex.: Contador, Jurídico…" {...field} />
                    </FormControl>
                    <datalist id="parceiro-categorias">
                      {COMMON_CATEGORIES.map((c) => <option key={c} value={c} />)}
                    </datalist>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nomeEmpresa"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome / Empresa</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="responsavel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Responsável / Contato</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="cnpjCpf"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CNPJ / CPF</FormLabel>
                      <FormControl><Input {...field} placeholder="00.000.000/0000-00" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="registroProfissional"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Registro profissional</FormLabel>
                      <FormControl><Input {...field} placeholder="OAB, CRC, CRM…" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail</FormLabel>
                      <FormControl><Input type="email" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="telefone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone / WhatsApp</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="site"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site / endereço</FormLabel>
                    <FormControl><Input {...field} placeholder="https://… ou endereço físico" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="ondeContrato"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Onde está o contrato?</FormLabel>
                      <FormControl><Input {...field} placeholder="Ex.: Drive Pasta Contratos" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="frequenciaContato"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frequência de contato</FormLabel>
                      <FormControl><Input {...field} placeholder="Mensal, trimestral, sob demanda…" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="temContratoFormal"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Tem contrato formal?</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Marque quando houver contrato assinado vigente com este parceiro.
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
        title="Importar planilha — Rede Externa"
        description="Envie a planilha modelo preenchida. Parceiros existentes serão atualizados (busca por CNPJ/CPF, depois por nome+responsável). Limite: 2MB. Sem disparo automático de convite."
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
