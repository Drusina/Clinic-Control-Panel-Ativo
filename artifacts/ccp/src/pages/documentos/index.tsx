import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getStoredToken, useCurrentRole, getActiveClinicId } from "@/hooks/use-auth";
import { useClinicsForCurrentUser } from "@/hooks/use-clinics-for-current-user";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, ArrowLeft, Search, ChevronRight, FileText, AlertTriangle, Upload, Trash2, X } from "lucide-react";
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
import { format, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CATEGORIAS = [
  "Contrato",
  "Licença",
  "Alvará",
  "Certificado",
  "Regulatório",
  "RH",
  "Financeiro",
  "Fiscal",
  "Seguro",
  "Outros",
];

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ativo: { label: "Ativo", variant: "default" },
  pendente: { label: "Pendente", variant: "secondary" },
  expirado: { label: "Expirado", variant: "destructive" },
};

type Documento = {
  id: string;
  clinicId: string;
  nome: string;
  categoria: string;
  storagePath: string | null;
  tamanho: number | null;
  mimeType: string | null;
  validade: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

async function fetchDocumentos(clinicId: string): Promise<Documento[]> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/clinics/${clinicId}/documentos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function createDocumento(clinicId: string, data: object): Promise<Documento> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/clinics/${clinicId}/documentos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create");
  return res.json();
}

async function updateDocumento(id: string, data: object): Promise<Documento> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/documentos/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update");
  return res.json();
}

async function deleteDocumento(id: string): Promise<void> {
  const token = getStoredToken();
  await fetch(`${BASE}/api/documentos/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function uploadDocumento(clinicId: string, docId: string, data: object): Promise<Documento> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/clinics/${clinicId}/documentos/${docId}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to upload");
  return res.json();
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getExpiryStatus(validade: string | null): { daysLeft: number | null; isExpiring: boolean; isExpired: boolean } {
  if (!validade) return { daysLeft: null, isExpiring: false, isExpired: false };
  const days = differenceInDays(parseISO(validade), new Date());
  return { daysLeft: days, isExpiring: days >= 0 && days <= 30, isExpired: days < 0 };
}

export default function DocumentosPage() {
  const params = useParams<{ clinicId: string }>();
  const clinicId = params.clinicId;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [filterCategoria, setFilterCategoria] = useState<string>("todas");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadDocId, setUploadDocId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [form, setForm] = useState({ nome: "", categoria: "", validade: "", status: "pendente" });

  const { data: documentos = [], isLoading } = useQuery({
    queryKey: ["documentos", clinicId],
    queryFn: () => fetchDocumentos(clinicId!),
    enabled: !!clinicId,
  });

  const createMut = useMutation({
    mutationFn: (data: object) => createDocumento(clinicId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documentos", clinicId] });
      setDialogOpen(false);
      setForm({ nome: "", categoria: "", validade: "", status: "pendente" });
      toast({ title: "Documento criado" });
    },
    onError: () => toast({ variant: "destructive", title: "Erro ao criar documento" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => updateDocumento(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documentos", clinicId] }),
    onError: () => toast({ variant: "destructive", title: "Erro ao atualizar" }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteDocumento,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documentos", clinicId] });
      toast({ title: "Documento removido" });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadDocId) return;
    setIsUploading(true);
    try {
      const fileBase64 = await fileToBase64(file);
      await uploadDocumento(clinicId!, uploadDocId, {
        fileName: file.name,
        fileBase64,
        mimeType: file.type,
      });
      queryClient.invalidateQueries({ queryKey: ["documentos", clinicId] });
      toast({ title: "Arquivo enviado" });
    } catch {
      toast({ variant: "destructive", title: "Erro ao enviar arquivo" });
    } finally {
      setIsUploading(false);
      setUploadDocId(null);
    }
  };

  if (!clinicId) return <ClinicSelector />;

  const filtered = documentos.filter(d => {
    const matchSearch = d.nome.toLowerCase().includes(search.toLowerCase()) || d.categoria.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategoria === "todas" || d.categoria === filterCategoria;
    return matchSearch && matchCat;
  });

  const expiringCount = documentos.filter(d => {
    const { isExpiring, isExpired } = getExpiryStatus(d.validade);
    return isExpiring || isExpired;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/documentos/select")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Documentos</h1>
            <p className="text-sm text-muted-foreground">Gestão de documentos gerais da clínica</p>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo Documento
        </Button>
      </div>

      {expiringCount > 0 && (
        <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
          <p className="text-sm text-yellow-700 font-medium">
            {expiringCount} documento(s) com vencimento em breve ou já expirado(s)
          </p>
        </div>
      )}

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar documentos..." className="pl-9" />
        </div>
        <Select value={filterCategoria} onValueChange={setFilterCategoria}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas categorias</SelectItem>
            {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Nome</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden sm:table-cell">Categoria</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Tamanho</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Validade</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    {documentos.length === 0 ? (
                      <div>
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p>Nenhum documento cadastrado.</p>
                      </div>
                    ) : "Nenhum resultado encontrado."}
                  </td>
                </tr>
              )}
              {filtered.map(doc => {
                const { daysLeft, isExpiring, isExpired } = getExpiryStatus(doc.validade);
                const statusInfo = STATUS_MAP[doc.status] ?? STATUS_MAP.pendente;
                return (
                  <tr key={doc.id} className={cn("hover:bg-muted/30 transition-colors", (isExpiring || isExpired) && "bg-yellow-50/50")}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium">{doc.nome}</span>
                        {(isExpiring || isExpired) && (
                          <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">
                      <span className="bg-muted text-xs px-2 py-0.5 rounded-full">{doc.categoria}</span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground hidden md:table-cell text-xs">
                      {formatSize(doc.tamanho)}
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      {doc.validade ? (
                        <div>
                          <span className={cn("text-xs", isExpired ? "text-destructive font-medium" : isExpiring ? "text-yellow-600 font-medium" : "text-muted-foreground")}>
                            {format(parseISO(doc.validade), "dd/MM/yyyy")}
                          </span>
                          {daysLeft !== null && (
                            <div className="text-[10px] text-muted-foreground">
                              {isExpired ? `Expirou há ${Math.abs(daysLeft)}d` : `${daysLeft}d restantes`}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Select value={doc.status} onValueChange={val => updateMut.mutate({ id: doc.id, data: { status: val } })}>
                        <SelectTrigger className="h-7 w-[110px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="ativo">Ativo</SelectItem>
                          <SelectItem value="expirado">Expirado</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 justify-end">
                        {!doc.storagePath && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => { setUploadDocId(doc.id); fileInputRef.current?.click(); }}
                            disabled={isUploading && uploadDocId === doc.id}
                          >
                            {isUploading && uploadDocId === doc.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <><Upload className="h-3 w-3 mr-1" /> Upload</>
                            }
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-destructive hover:text-destructive"
                          onClick={() => deleteMut.mutate(doc.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader><DialogTitle>Novo Documento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome *</label>
              <Input placeholder="Ex: Alvará de funcionamento 2025" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Categoria *</label>
              <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Validade</label>
                <Input type="date" value={form.validade} onChange={e => setForm(f => ({ ...f, validade: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Status</label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="expirado">Expirado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate(form)} disabled={createMut.isPending || !form.nome || !form.categoria}>
              {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Criar Documento
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
  const { data: user } = useCurrentRole();
  const isTeamMember = user?.role === "team_member";
  const isSuperAdmin = user?.role === "super_admin";
  const { clinics, isLoading } = useClinicsForCurrentUser({ pageSize: 100 });

  // Clinic-first: a manager must never see a list of their other clinics.
  // Resolve to the active clinic (or their only one) and enter it directly;
  // with 2+ clinics and no active selection, send them to the chooser.
  useEffect(() => {
    if (!isTeamMember || isLoading) return;
    const active = getActiveClinicId();
    const match =
      (active && clinics.find((c) => c.id === active)) ||
      (clinics.length === 1 ? clinics[0] : undefined);
    navigate(match ? `/portal/documentos/${match.id}` : "/me/clinicas", {
      replace: true,
    });
  }, [isTeamMember, isLoading, clinics, navigate]);

  // Only a confirmed super_admin may render the clinic list. While the role is
  // still loading (user undefined) `isSuperAdmin` is false, so we show a spinner
  // instead of flashing other clinics; the effect above scopes managers to
  // their active clinic (or the chooser).
  if (!isSuperAdmin) {
    return (
      <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
    );
  }

  const filtered = clinics.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    (c.cidade ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Documentos</h1>
        <p className="text-sm text-muted-foreground">Selecione uma clínica para gerenciar os documentos.</p>
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
            <button key={c.id} onClick={() => navigate(`/documentos/${c.id}`)}
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
