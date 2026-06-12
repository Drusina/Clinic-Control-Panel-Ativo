import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getStoredToken, useCurrentRole, getActiveClinicId } from "@/hooks/use-auth";
import { useClinicsForCurrentUser } from "@/hooks/use-clinics-for-current-user";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, ArrowLeft, Search, ChevronRight, Upload, FileText, Image, File, Video, Trash2, X, Eye, Download } from "lucide-react";
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
import { downloadUrl } from "@/lib/download";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PILARES = [
  { slug: "estrategia", nome: "Estratégia", color: "bg-blue-100 text-blue-700" },
  { slug: "financeiro", nome: "Financeiro", color: "bg-green-100 text-green-700" },
  { slug: "contabil", nome: "Contabilidade", color: "bg-teal-100 text-teal-700" },
  { slug: "marketing", nome: "Marketing", color: "bg-purple-100 text-purple-700" },
  { slug: "operacoes", nome: "Operações", color: "bg-orange-100 text-orange-700" },
  { slug: "pessoas", nome: "Pessoas", color: "bg-pink-100 text-pink-700" },
  { slug: "tecnologia", nome: "Tecnologia", color: "bg-cyan-100 text-cyan-700" },
  { slug: "compliance", nome: "Compliance", color: "bg-red-100 text-red-700" },
];

type Evidencia = {
  id: string;
  clinicId: string;
  pilarSlug: string;
  nome: string;
  tipo: string | null;
  descricao: string | null;
  responsavel: string | null;
  storagePath: string | null;
  tamanho: number | null;
  mimeType: string | null;
  createdAt: string;
};

async function fetchEvidencias(clinicId: string): Promise<Evidencia[]> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/clinics/${clinicId}/evidencias`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function uploadEvidencia(clinicId: string, data: object): Promise<Evidencia> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/clinics/${clinicId}/evidencias/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to upload");
  return res.json();
}

async function deleteEvidencia(id: string): Promise<void> {
  const token = getStoredToken();
  await fetch(`${BASE}/api/evidencias/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function fetchSignedUrl(clinicId: string, evidenciaId: string): Promise<string> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/clinics/${clinicId}/evidencias/${evidenciaId}/signed-url`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to get signed URL");
  const { url } = await res.json();
  return url;
}

function getFileIcon(tipo: string | null, mimeType: string | null) {
  if (tipo === "imagem" || mimeType?.startsWith("image/")) return <Image className="h-8 w-8 text-purple-500" />;
  if (tipo === "video" || mimeType?.startsWith("video/")) return <Video className="h-8 w-8 text-blue-500" />;
  if (tipo === "pdf" || mimeType?.includes("pdf")) return <FileText className="h-8 w-8 text-red-500" />;
  return <File className="h-8 w-8 text-gray-400" />;
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
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function EvidenciasPage() {
  const params = useParams<{ clinicId: string }>();
  const clinicId = params.clinicId;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<string>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadForm, setUploadForm] = useState({ pilarSlug: "", descricao: "", responsavel: "" });
  const [isUploading, setIsUploading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);

  const handleViewOrDownload = async (ev: Evidencia) => {
    if (!ev.storagePath) return;
    setLoadingFileId(ev.id);
    try {
      const url = await fetchSignedUrl(clinicId!, ev.id);
      const isImage = ev.tipo === "imagem" || ev.mimeType?.startsWith("image/");
      if (isImage) {
        setLightboxUrl(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      toast({ variant: "destructive", title: "Erro ao obter URL do arquivo" });
    } finally {
      setLoadingFileId(null);
    }
  };

  const handleDownload = async (ev: Evidencia) => {
    if (!ev.storagePath) return;
    setLoadingFileId(ev.id);
    try {
      const url = await fetchSignedUrl(clinicId!, ev.id);
      const result = downloadUrl(url, ev.nome);
      if (result === "blocked") {
        toast({
          variant: "destructive",
          title: "Download bloqueado pelo navegador",
          description:
            "Seu navegador bloqueou a abertura. Permita pop-ups deste site para baixar o arquivo.",
        });
      }
    } catch {
      toast({ variant: "destructive", title: "Erro ao baixar arquivo" });
    } finally {
      setLoadingFileId(null);
    }
  };

  const { data: evidencias = [], isLoading } = useQuery({
    queryKey: ["evidencias", clinicId],
    queryFn: () => fetchEvidencias(clinicId!),
    enabled: !!clinicId,
  });

  const deleteMut = useMutation({
    mutationFn: deleteEvidencia,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evidencias", clinicId] });
      toast({ title: "Evidência removida" });
    },
    onError: () => toast({ variant: "destructive", title: "Erro ao remover" }),
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setPendingFiles(files);
      setDialogOpen(true);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) {
      setPendingFiles(files);
      setDialogOpen(true);
    }
  };

  const handleUpload = async () => {
    if (!uploadForm.pilarSlug || pendingFiles.length === 0) return;
    setIsUploading(true);
    try {
      for (const file of pendingFiles) {
        const fileBase64 = await fileToBase64(file);
        await uploadEvidencia(clinicId!, {
          fileName: file.name,
          fileBase64,
          mimeType: file.type,
          pilarSlug: uploadForm.pilarSlug,
          descricao: uploadForm.descricao || undefined,
          responsavel: uploadForm.responsavel || undefined,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["evidencias", clinicId] });
      toast({ title: `${pendingFiles.length} evidência(s) enviada(s)` });
      setDialogOpen(false);
      setPendingFiles([]);
      setUploadForm({ pilarSlug: "", descricao: "", responsavel: "" });
    } catch {
      toast({ variant: "destructive", title: "Erro ao enviar evidências" });
    } finally {
      setIsUploading(false);
    }
  };

  if (!clinicId) return <ClinicSelector />;

  const filtered = activeTab === "todos" ? evidencias : evidencias.filter(e => e.pilarSlug === activeTab);

  const grouped = PILARES.reduce((acc, pilar) => {
    const items = filtered.filter(e => e.pilarSlug === pilar.slug);
    if (items.length > 0) acc[pilar.slug] = { pilar, items };
    return acc;
  }, {} as Record<string, { pilar: typeof PILARES[0]; items: Evidencia[] }>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/evidencias/select")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Evidências</h1>
            <p className="text-sm text-muted-foreground">Arquivos e documentos organizados por pilar</p>
          </div>
        </div>
        <Button onClick={() => { setPendingFiles([]); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nova Evidência
        </Button>
      </div>

      <div
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/30"
        )}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Arraste arquivos aqui ou <span className="text-primary font-medium">clique para selecionar</span></p>
        <p className="text-xs text-muted-foreground mt-1">PDF, imagens, documentos, vídeos</p>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setActiveTab("todos")}
          className={cn("px-3 py-1.5 rounded-full text-sm font-medium transition-colors", activeTab === "todos" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}
        >
          Todos ({evidencias.length})
        </button>
        {PILARES.filter(p => evidencias.some(e => e.pilarSlug === p.slug)).map(p => (
          <button
            key={p.slug}
            onClick={() => setActiveTab(p.slug)}
            className={cn("px-3 py-1.5 rounded-full text-sm font-medium transition-colors", activeTab === p.slug ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}
          >
            {p.nome} ({evidencias.filter(e => e.pilarSlug === p.slug).length})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : evidencias.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Upload className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma evidência cadastrada. Faça upload de arquivos acima.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.values(grouped).map(({ pilar, items }) => (
            <div key={pilar.slug}>
              <div className="flex items-center gap-2 mb-3">
                <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium", pilar.color)}>{pilar.nome}</span>
                <span className="text-xs text-muted-foreground">{items.length} arquivo(s)</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {items.map(ev => (
                  <div key={ev.id} className="border rounded-xl p-3 bg-card hover:shadow-sm transition-shadow group relative">
                    <button
                      onClick={() => deleteMut.mutate(ev.id)}
                      className="absolute top-2 right-2 h-6 w-6 rounded-full bg-destructive/10 text-destructive items-center justify-center hidden group-hover:flex hover:bg-destructive hover:text-white transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                    <div className="flex flex-col items-center gap-2 py-2">
                      {getFileIcon(ev.tipo, ev.mimeType)}
                      <div className="text-center">
                        <div className="text-xs font-medium leading-tight line-clamp-2 break-all">{ev.nome}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">{formatSize(ev.tamanho)}</div>
                      </div>
                    </div>
                    {ev.descricao && <p className="text-[10px] text-muted-foreground line-clamp-1 border-t pt-1.5 mt-1">{ev.descricao}</p>}
                    {ev.responsavel && <p className="text-[10px] text-muted-foreground">Resp: {ev.responsavel}</p>}
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(ev.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                    {ev.storagePath && (
                      <div className="flex gap-1 mt-2 border-t pt-2">
                        <button
                          onClick={() => handleViewOrDownload(ev)}
                          disabled={loadingFileId === ev.id}
                          className="flex-1 flex items-center justify-center gap-1 text-[10px] text-primary hover:bg-primary/10 rounded px-1 py-1 transition-colors disabled:opacity-50"
                        >
                          {loadingFileId === ev.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                          {ev.tipo === "imagem" || ev.mimeType?.startsWith("image/") ? "Ver" : "Abrir"}
                        </button>
                        <button
                          onClick={() => handleDownload(ev)}
                          disabled={loadingFileId === ev.id}
                          className="flex-1 flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:bg-muted/60 rounded px-1 py-1 transition-colors disabled:opacity-50"
                        >
                          <Download className="h-3 w-3" />
                          Baixar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-4 w-4" />
          </button>
          <img
            src={lightboxUrl}
            alt="Prévia da evidência"
            className="max-h-[85vh] max-w-full rounded-lg shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) { setDialogOpen(false); setPendingFiles([]); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader><DialogTitle>Nova Evidência</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {pendingFiles.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-2">{pendingFiles.length} arquivo(s) selecionado(s):</p>
                <div className="space-y-1">
                  {pendingFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {getFileIcon(null, f.type)}
                      <span className="truncate">{f.name}</span>
                      <span className="text-muted-foreground shrink-0">{formatSize(f.size)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {pendingFiles.length === 0 && (
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Clique para selecionar arquivos</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">Pilar *</label>
              <Select value={uploadForm.pilarSlug} onValueChange={v => setUploadForm(f => ({ ...f, pilarSlug: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o pilar" /></SelectTrigger>
                <SelectContent>
                  {PILARES.map(p => <SelectItem key={p.slug} value={p.slug}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Responsável</label>
              <Input placeholder="Nome do responsável" value={uploadForm.responsavel} onChange={e => setUploadForm(f => ({ ...f, responsavel: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição</label>
              <Textarea rows={2} className="resize-none" placeholder="Breve descrição..." value={uploadForm.descricao} onChange={e => setUploadForm(f => ({ ...f, descricao: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setPendingFiles([]); }}>Cancelar</Button>
            <Button onClick={handleUpload} disabled={isUploading || !uploadForm.pilarSlug || pendingFiles.length === 0}>
              {isUploading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Enviar {pendingFiles.length > 0 ? `(${pendingFiles.length})` : ""}
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
    navigate(match ? `/portal/evidencias/${match.id}` : "/me/clinicas", {
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
        <h1 className="text-2xl font-bold">Evidências</h1>
        <p className="text-sm text-muted-foreground">Selecione uma clínica para ver as evidências.</p>
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
            <button key={c.id} onClick={() => navigate(`/evidencias/${c.id}`)}
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
