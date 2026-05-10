import { useRef, useState } from "react";
import { 
  useListTeam, 
  getListTeamQueryKey, 
  useCreateTeamMember, 
  useUpdateTeamMember, 
  useDeleteTeamMember 
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, MoreHorizontal, User, Mail, Phone, Download, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Send, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import { ViewToggle, useViewMode } from "@/components/view-toggle";
import { SortableTh } from "@/components/sortable-th";
import { useTableSortFilter } from "@/hooks/use-table-sort-filter";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getStoredToken } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TeamMember } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatCpf(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11) return raw;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const formSchema = z.object({
  nome: z.string().min(2, "Nome obrigatório"),
  funcao: z.string().optional(),
  area: z.string().optional(),
  vinculo: z.enum(["CLT", "PJ", "Socio", "Terceirizado"]).optional(),
  tipoJornada: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  whatsapp: z.string().optional(),
  cpf: z.string().optional(),
  dataAdmissao: z.string().optional(),
  respondeA: z.string().optional(),
  observacoes: z.string().optional(),
  temAcessoPlataforma: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; field?: string; message: string }[];
}

type BulkInviteStatus =
  | "sent"
  | "pending"
  | "skipped_no_email"
  | "skipped_already_active"
  | "not_found"
  | "error";

interface BulkInviteSummary {
  sent: number;
  skipped: number;
  failed: number;
  total: number;
  results: { id: string; nome: string; status: BulkInviteStatus; reason?: string | null }[];
}

const STATUS_LABELS: Record<BulkInviteStatus, string> = {
  sent: "Convite enviado",
  pending: "Pendente (e-mail não enviou)",
  skipped_no_email: "Sem e-mail válido",
  skipped_already_active: "Já tem acesso ativo",
  not_found: "Não encontrado",
  error: "Erro",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function TeamTab({ clinicId }: { clinicId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkInviteOpen, setIsBulkInviteOpen] = useState(false);
  const [bulkInviting, setBulkInviting] = useState(false);
  const [bulkInviteSummary, setBulkInviteSummary] = useState<BulkInviteSummary | null>(null);
  const [bulkInviteError, setBulkInviteError] = useState<string | null>(null);

  const { data: team, isLoading } = useListTeam(clinicId, {
    query: { enabled: !!clinicId, queryKey: getListTeamQueryKey(clinicId) },
  });

  const createMember = useCreateTeamMember();
  const updateMember = useUpdateTeamMember();
  const deleteMember = useDeleteTeamMember();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: "",
      funcao: "",
      area: "",
      vinculo: "CLT",
      tipoJornada: "",
      email: "",
      whatsapp: "",
      cpf: "",
      dataAdmissao: "",
      respondeA: "",
      observacoes: "",
      temAcessoPlataforma: false,
    },
  });

  const openDialog = (member?: TeamMember) => {
    if (member) {
      setEditingMember(member);
      form.reset({
        nome: member.nome,
        funcao: member.funcao || "",
        area: member.area || "",
        vinculo: (member.vinculo as FormValues["vinculo"]) || "CLT",
        tipoJornada: member.tipoJornada || "",
        email: member.email || "",
        whatsapp: member.whatsapp || "",
        cpf: member.cpf || "",
        dataAdmissao: member.dataAdmissao || "",
        respondeA: member.respondeA || "",
        observacoes: member.observacoes || "",
        temAcessoPlataforma: member.temAcessoPlataforma,
      });
    } else {
      setEditingMember(null);
      form.reset({
        nome: "",
        funcao: "",
        area: "",
        vinculo: "CLT",
        tipoJornada: "",
        email: "",
        whatsapp: "",
        cpf: "",
        dataAdmissao: "",
        respondeA: "",
        observacoes: "",
        temAcessoPlataforma: false,
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (values: FormValues) => {
    const payload = {
      ...values,
      area: values.area || null,
      tipoJornada: values.tipoJornada || null,
      cpf: values.cpf || null,
      dataAdmissao: values.dataAdmissao || null,
      respondeA: values.respondeA || null,
      observacoes: values.observacoes || null,
    };
    if (editingMember) {
      updateMember.mutate(
        { id: editingMember.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Membro atualizado" });
            queryClient.invalidateQueries({ queryKey: getListTeamQueryKey(clinicId) });
            setIsDialogOpen(false);
          },
          onError: (err: Error) => toast({ variant: "destructive", title: "Erro ao atualizar", description: err.message }),
        }
      );
    } else {
      createMember.mutate(
        { clinicId, data: payload as Parameters<typeof createMember.mutate>[0]["data"] },
        {
          onSuccess: () => {
            toast({ title: "Membro adicionado" });
            queryClient.invalidateQueries({ queryKey: getListTeamQueryKey(clinicId) });
            setIsDialogOpen(false);
          },
          onError: (err: Error) => toast({ variant: "destructive", title: "Erro ao adicionar", description: err.message }),
        }
      );
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Deseja realmente excluir este membro da equipe?")) {
      deleteMember.mutate(
        { id },
        {
          onSuccess: () => {
            toast({ title: "Membro excluído" });
            queryClient.invalidateQueries({ queryKey: getListTeamQueryKey(clinicId) });
          },
        }
      );
    }
  };

  const exportTeam = async () => {
    setExporting(true);
    try {
      const token = getStoredToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${BASE}/api/clinics/${clinicId}/team/export`, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? res.statusText);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || "Quadro_Funcional.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Planilha exportada", description: `${(team ?? []).length} membro(s) incluídos.` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao exportar planilha";
      toast({ variant: "destructive", title: "Erro ao exportar", description: message });
    } finally {
      setExporting(false);
    }
  };

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      const token = getStoredToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${BASE}/api/clinics/${clinicId}/team/template`, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? res.statusText);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || "Quadro_Funcional.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao baixar modelo";
      toast({ variant: "destructive", title: "Erro ao baixar modelo", description: message });
    } finally {
      setDownloading(false);
    }
  };

  const inviteCandidates = (team ?? []).filter(
    (m) => !!m.email && EMAIL_RE.test(m.email) && !(m.temAcessoPlataforma && m.lastAccessAt),
  );
  const inviteCandidateIds = inviteCandidates.map((m) => m.id);

  const teamCount = team?.length ?? 0;
  const { mode: viewMode, setMode: setViewMode } = useViewMode("ccp_view_equipe", teamCount);

  type TeamSortKey = "nome" | "funcao" | "email" | "whatsapp" | "temAcessoPlataforma" | "vinculo";
  const tableData = useTableSortFilter<NonNullable<typeof team>[number], TeamSortKey>(team ?? [], {
    initialSort: { key: "nome", dir: "asc" },
    searchFields: (m) => [m.nome, m.funcao, m.email, m.whatsapp, m.area, m.vinculo, m.cpf],
    getSortValue: (m, k) => {
      if (k === "temAcessoPlataforma") return !!m.temAcessoPlataforma;
      return (m as unknown as Record<string, unknown>)[k] as string | null | undefined;
    },
  });
  const allCandidatesSelected =
    inviteCandidateIds.length > 0 && inviteCandidateIds.every((id) => selectedIds.has(id));
  const someCandidatesSelected = inviteCandidateIds.some((id) => selectedIds.has(id));

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllCandidates = () => {
    if (allCandidatesSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(inviteCandidateIds));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const openBulkInvite = () => {
    setBulkInviteSummary(null);
    setBulkInviteError(null);
    setIsBulkInviteOpen(true);
  };

  const submitBulkInvite = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkInviting(true);
    setBulkInviteError(null);
    setBulkInviteSummary(null);
    try {
      const token = getStoredToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${BASE}/api/clinics/${clinicId}/team/bulk-invite`, {
        method: "POST",
        headers,
        body: JSON.stringify({ memberIds: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const summary = data as BulkInviteSummary;
      setBulkInviteSummary(summary);
      queryClient.invalidateQueries({ queryKey: getListTeamQueryKey(clinicId) });
      toast({
        title: "Convites em lote concluídos",
        description: `${summary.sent} enviados · ${summary.skipped} ignorados · ${summary.failed} falhas`,
      });
      setSelectedIds(new Set());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao enviar convites";
      setBulkInviteError(message);
    } finally {
      setBulkInviting(false);
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
      const res = await fetch(`${BASE}/api/clinics/${clinicId}/team/import`, {
        method: "POST",
        headers,
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setImportSummary(data as ImportSummary);
      queryClient.invalidateQueries({ queryKey: getListTeamQueryKey(clinicId) });
      const summary = data as ImportSummary;
      toast({
        title: "Importação concluída",
        description: `${summary.created} criados, ${summary.updated} atualizados, ${summary.skipped} ignorados`,
      });
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
          <h3 className="text-lg font-medium">Equipe da Clínica</h3>
          <p className="text-sm text-muted-foreground">Gerencie os colaboradores e seus acessos.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <ViewToggle mode={viewMode} onChange={setViewMode} className="mr-1" />
          <Button variant="outline" onClick={downloadTemplate} disabled={downloading}>
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Baixar modelo
          </Button>
          <Button
            variant="outline"
            onClick={exportTeam}
            disabled={exporting || !team || team.length === 0}
            title={!team || team.length === 0 ? "Nenhum membro para exportar" : undefined}
          >
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            Exportar planilha
          </Button>
          <Button variant="outline" onClick={openImport}>
            <Upload className="mr-2 h-4 w-4" /> Importar planilha
          </Button>
          <Button onClick={() => openDialog()}>
            <Plus className="mr-2 h-4 w-4" /> Adicionar Membro
          </Button>
        </div>
      </div>

      {inviteCandidateIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="bulk-invite-select-all"
              checked={allCandidatesSelected ? true : someCandidatesSelected ? "indeterminate" : false}
              onCheckedChange={() => toggleSelectAllCandidates()}
            />
            <label htmlFor="bulk-invite-select-all" className="text-sm cursor-pointer">
              Selecionar todos os membros sem acesso ({inviteCandidateIds.length})
            </label>
          </div>
          <div className="flex-1" />
          {selectedIds.size > 0 && (
            <span className="text-xs text-muted-foreground">
              {selectedIds.size} selecionado{selectedIds.size === 1 ? "" : "s"}
            </span>
          )}
          {selectedIds.size > 0 && (
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Limpar
            </Button>
          )}
          <Button size="sm" onClick={openBulkInvite} disabled={selectedIds.size === 0}>
            <Send className="mr-2 h-4 w-4" /> Convidar selecionados
          </Button>
        </div>
      )}

      {viewMode === "table" && (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por nome, função, e-mail…"
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
                  <SortableTh sortKey="funcao" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>Cargo</SortableTh>
                  <SortableTh sortKey="email" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>E-mail</SortableTh>
                  <SortableTh sortKey="whatsapp" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>Telefone</SortableTh>
                  <SortableTh sortKey="vinculo" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>Vínculo</SortableTh>
                  <SortableTh sortKey="temAcessoPlataforma" currentKey={tableData.sort.key} currentDir={tableData.sort.dir} onSort={tableData.toggleSort}>Acesso</SortableTh>
                  <TableHead className="w-[60px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableData.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {teamCount === 0 ? "Nenhum membro cadastrado." : "Nenhum membro encontrado."}
                    </TableCell>
                  </TableRow>
                ) : (
                  tableData.items.map((member) => {
                    const isCandidate = inviteCandidateIds.includes(member.id);
                    return (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {isCandidate ? (
                              <Checkbox
                                checked={selectedIds.has(member.id)}
                                onCheckedChange={() => toggleSelected(member.id)}
                                aria-label={`Selecionar ${member.nome}`}
                              />
                            ) : (
                              <div className="h-4 w-4" aria-hidden />
                            )}
                            <span className="font-medium">{member.nome}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{member.funcao || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{member.email || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{member.whatsapp || "—"}</TableCell>
                        <TableCell>
                          {member.vinculo ? <Badge variant="outline">{member.vinculo}</Badge> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {member.temAcessoPlataforma
                            ? <Badge variant="secondary">Com acesso</Badge>
                            : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openDialog(member)}>Editar</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDelete(member.id)} className="text-destructive">
                                Excluir
                              </DropdownMenuItem>
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
        {team && team.length > 0 ? (
          team.map((member) => {
            const isCandidate = inviteCandidateIds.includes(member.id);
            return (
            <div key={member.id} className="flex flex-col bg-card border rounded-lg p-5">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  {isCandidate ? (
                    <Checkbox
                      checked={selectedIds.has(member.id)}
                      onCheckedChange={() => toggleSelected(member.id)}
                      aria-label={`Selecionar ${member.nome}`}
                    />
                  ) : (
                    <div className="h-4 w-4" aria-hidden />
                  )}
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">{member.nome}</h4>
                    <p className="text-xs text-muted-foreground">{member.funcao || "Sem função"}</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openDialog(member)}>Editar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDelete(member.id)} className="text-destructive">
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-2 text-sm flex-1">
                {member.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> <span className="truncate">{member.email}</span>
                  </div>
                )}
                {member.whatsapp && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> <span>{member.whatsapp}</span>
                  </div>
                )}
                {member.cpf && (
                  <div className="text-xs text-muted-foreground">
                    CPF: <span className="text-foreground font-mono">{formatCpf(member.cpf)}</span>
                  </div>
                )}
                {member.dataAdmissao && (
                  <div className="text-xs text-muted-foreground">
                    Admissão: <span className="text-foreground">{formatDate(member.dataAdmissao)}</span>
                  </div>
                )}
                {member.respondeA && (
                  <div className="text-xs text-muted-foreground">
                    Responde a: <span className="text-foreground">{member.respondeA}</span>
                  </div>
                )}
                {member.observacoes && (
                  <div className="text-xs text-muted-foreground line-clamp-2" title={member.observacoes}>
                    Obs.: <span className="text-foreground">{member.observacoes}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-4 pt-4 border-t flex-wrap">
                {member.area && <Badge variant="outline">{member.area}</Badge>}
                {member.vinculo && <Badge variant="outline">{member.vinculo}</Badge>}
                {member.tipoJornada && <Badge variant="outline">{member.tipoJornada}</Badge>}
                {member.temAcessoPlataforma && (
                  <Badge variant="secondary" className="ml-auto">Com Acesso</Badge>
                )}
              </div>
            </div>
            );
          })
        ) : (
          <div className="col-span-full py-12 text-center border rounded-lg border-dashed text-muted-foreground">
            Nenhum membro cadastrado.
          </div>
        )}
      </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMember ? "Editar Membro" : "Adicionar Membro"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome completo *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="funcao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Função / Cargo</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="area"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Área</FormLabel>
                      <FormControl><Input {...field} placeholder="Ex.: Recepção, Médicos…" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="vinculo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vínculo</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="CLT">CLT</SelectItem>
                          <SelectItem value="PJ">PJ</SelectItem>
                          <SelectItem value="Socio">Sócio</SelectItem>
                          <SelectItem value="Terceirizado">Terceirizado</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tipoJornada"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de jornada</FormLabel>
                      <FormControl><Input {...field} placeholder="Integral, parcial…" /></FormControl>
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
                  name="whatsapp"
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
                  name="cpf"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CPF</FormLabel>
                      <FormControl><Input {...field} placeholder="000.000.000-00" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dataAdmissao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de admissão</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="respondeA"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responde a (gestor direto)</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
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
              <FormField
                control={form.control}
                name="temAcessoPlataforma"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Acesso à Plataforma</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Concede acesso para o membro visualizar e interagir no painel da clínica.
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter className="pt-4">
                <Button type="submit" disabled={createMember.isPending || updateMember.isPending}>
                  {(createMember.isPending || updateMember.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
            <DialogTitle>Importar planilha — Quadro Funcional</DialogTitle>
            <DialogDescription>
              Envie a planilha modelo preenchida. Membros existentes serão atualizados (busca por CPF, depois e-mail).
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
                    <p className="font-medium">Importação concluída</p>
                    <p className="text-muted-foreground">
                      {importSummary.created} criados · {importSummary.updated} atualizados · {importSummary.skipped} ignorados
                    </p>
                  </div>
                </div>
                {importSummary.errors.length > 0 && (
                  <div className="rounded-md border p-3 max-h-48 overflow-y-auto">
                    <p className="text-sm font-medium mb-2">Linhas ignoradas:</p>
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

      <Dialog open={isBulkInviteOpen} onOpenChange={(open) => { if (!bulkInviting) setIsBulkInviteOpen(open); }}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Enviar convites em lote</DialogTitle>
            <DialogDescription>
              {bulkInviteSummary
                ? "Resultado do envio de convites para os membros selecionados."
                : `${selectedIds.size} membro${selectedIds.size === 1 ? "" : "s"} selecionado${selectedIds.size === 1 ? "" : "s"} receberão convite por e-mail. Membros sem e-mail válido ou já ativos serão ignorados automaticamente.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {bulkInviteError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 flex gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{bulkInviteError}</span>
              </div>
            )}

            {bulkInviteSummary && (
              <>
                <div className="rounded-md border bg-muted/30 p-3 flex gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
                  <div className="flex-1">
                    <p className="font-medium">Convites processados</p>
                    <p className="text-muted-foreground">
                      {bulkInviteSummary.sent} enviados · {bulkInviteSummary.skipped} ignorados · {bulkInviteSummary.failed} falhas
                    </p>
                  </div>
                </div>
                {bulkInviteSummary.results.length > 0 && (
                  <div className="rounded-md border p-3 max-h-64 overflow-y-auto">
                    <ul className="text-xs space-y-1">
                      {bulkInviteSummary.results.map((r) => (
                        <li key={r.id} className="flex justify-between gap-3">
                          <span className="truncate">{r.nome}</span>
                          <span className={
                            r.status === "sent" ? "text-green-600" :
                            r.status === "error" || r.status === "pending" ? "text-destructive" :
                            "text-muted-foreground"
                          }>
                            {STATUS_LABELS[r.status]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkInviteOpen(false)} disabled={bulkInviting}>
              {bulkInviteSummary ? "Fechar" : "Cancelar"}
            </Button>
            {!bulkInviteSummary && (
              <Button onClick={submitBulkInvite} disabled={bulkInviting || selectedIds.size === 0}>
                {bulkInviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Send className="mr-2 h-4 w-4" /> Enviar convites
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
