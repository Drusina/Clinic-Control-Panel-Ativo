import { useRef, useState } from "react";
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
  Download, Upload, FileSpreadsheet, AlertCircle, CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getStoredToken } from "@/hooks/use-auth";
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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; field?: string; message: string }[];
}

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
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: sistemas, isLoading } = useListSistemasUso(clinicId, {
    query: { enabled: !!clinicId, queryKey: getListSistemasUsoQueryKey(clinicId) },
  });
  const createMut = useCreateSistemaUso();
  const updateMut = useUpdateSistemaUso();
  const deleteMut = useDeleteSistemaUso();

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

  const downloadXlsx = async (kind: "template" | "export") => {
    const setLoading = kind === "template" ? setDownloading : setExporting;
    setLoading(true);
    try {
      const token = getStoredToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${BASE}/api/clinics/${clinicId}/sistemas-uso/${kind}`, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? res.statusText);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || "Sistemas_e_Acessos.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      if (kind === "export") {
        toast({ title: "Planilha exportada", description: `${(sistemas ?? []).length} sistema(s) incluído(s).` });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao baixar planilha";
      toast({ variant: "destructive", title: kind === "template" ? "Erro ao baixar modelo" : "Erro ao exportar", description: message });
    } finally {
      setLoading(false);
    }
  };

  const openImport = () => {
    setImportSummary(null);
    setImportError(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsImportOpen(true);
  };

  const submitImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setImportError(null);
    setImportSummary(null);
    try {
      const token = getStoredToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const formData = new FormData();
      formData.append("file", selectedFile);
      const res = await fetch(`${BASE}/api/clinics/${clinicId}/sistemas-uso/import`, {
        method: "POST", headers, body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setImportSummary(data as ImportSummary);
      queryClient.invalidateQueries({ queryKey: getListSistemasUsoQueryKey(clinicId) });
      const summary = data as ImportSummary;
      if (res.status === 409) {
        setImportError(data.error ?? "Importação revertida.");
      } else {
        toast({
          title: "Importação concluída",
          description: `${summary.created} criados, ${summary.updated} atualizados, ${summary.skipped} ignorados`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao importar";
      setImportError(message);
    } finally {
      setImporting(false);
    }
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => downloadXlsx("template")} disabled={downloading}>
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Baixar modelo
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadXlsx("export")}
            disabled={exporting || !sistemas || sistemas.length === 0}
            title={!sistemas || sistemas.length === 0 ? "Nenhum sistema para exportar" : undefined}
          >
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            Exportar planilha
          </Button>
          <Button variant="outline" onClick={openImport}>
            <Upload className="mr-2 h-4 w-4" /> Importar planilha
          </Button>
          <Button onClick={() => openDialog()}>
            <Plus className="mr-2 h-4 w-4" /> Adicionar Sistema
          </Button>
        </div>
      </div>

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
          <div className="col-span-full py-12 text-center border rounded-lg border-dashed text-muted-foreground">
            Nenhum sistema cadastrado.
          </div>
        )}
      </div>

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

      <Dialog open={isImportOpen} onOpenChange={(open) => { if (!importing) setIsImportOpen(open); }}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Importar planilha — Sistemas e Acessos</DialogTitle>
            <DialogDescription>
              Envie a planilha modelo preenchida. Sistemas existentes serão atualizados (busca por Nome + Fornecedor + Tipo).
              Limite: 2MB. Sem disparo automático de convite.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-md border p-3">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                {selectedFile ? (
                  <>
                    <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum arquivo selecionado</p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                Selecionar
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setSelectedFile(f);
                  setImportSummary(null);
                  setImportError(null);
                }}
              />
            </div>
            {importError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 flex gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{importError}</span>
              </div>
            )}
            {importSummary && (
              <div className="space-y-2">
                <div className="rounded-md border bg-muted/30 p-3 flex gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
                  <div className="flex-1">
                    <p className="font-medium">Resultado da importação</p>
                    <p className="text-muted-foreground">
                      {importSummary.created} criados · {importSummary.updated} atualizados · {importSummary.skipped} ignorados
                    </p>
                  </div>
                </div>
                {importSummary.errors.length > 0 && (
                  <div className="rounded-md border p-3 max-h-48 overflow-y-auto">
                    <p className="text-sm font-medium mb-2">Linhas com problemas:</p>
                    <ul className="text-xs space-y-1 text-muted-foreground">
                      {importSummary.errors.slice(0, 50).map((err, i) => (
                        <li key={i}>
                          <span className="font-mono">L{err.row}</span>
                          {err.field ? ` (${err.field})` : ""}: {err.message}
                        </li>
                      ))}
                      {importSummary.errors.length > 50 && (
                        <li className="italic">…e mais {importSummary.errors.length - 50} linhas</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportOpen(false)} disabled={importing}>
              {importSummary ? "Fechar" : "Cancelar"}
            </Button>
            <Button onClick={submitImport} disabled={!selectedFile || importing}>
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {importSummary ? "Importar novamente" : "Importar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
