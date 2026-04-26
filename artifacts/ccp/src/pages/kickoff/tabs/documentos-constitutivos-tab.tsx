import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Upload,
  Eye,
  FileText,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
  X,
  ArrowRight,
} from "lucide-react";
import {
  useDocsConstitutivos,
  useAddDocConstitutivoFile,
  useDeleteDocConstitutivoFile,
  getSignedFileUrl,
  getSignedUrl,
  type DocConstitutivoData,
  type DocConstitutivoFileData,
} from "@/hooks/use-kickoff-api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props { clinicId: string }

const CATEGORIES = ["Jurídico", "Funcionamento", "Financeiro", "Estrutura", "Seguros"];

function formatSize(bytes?: number | null) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isLegacyId(id: string): boolean {
  return id.startsWith("legacy-");
}

function FileLine({
  file,
  clinicId,
  docId,
  onDelete,
}: {
  file: DocConstitutivoFileData;
  clinicId: string;
  docId: string;
  onDelete: (fileId: string) => void;
}) {
  const legacy = isLegacyId(file.id);

  async function view() {
    try {
      const url = legacy
        ? await getSignedUrl(clinicId, docId)
        : await getSignedFileUrl(clinicId, docId, file.id);
      window.open(url, "_blank");
    } catch (e) {
      alert(`Erro ao abrir arquivo: ${(e as Error).message}`);
    }
  }

  return (
    <div className="flex items-center gap-2 py-2 px-3 bg-muted/30 rounded text-sm" data-testid={`file-row-${file.id}`}>
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium" title={file.fileName}>{file.fileName}</p>
        <p className="text-xs text-muted-foreground">
          Enviado em {new Date(file.enviadoEm).toLocaleDateString("pt-BR")}
          {file.tamanho ? ` · ${formatSize(file.tamanho)}` : ""}
        </p>
      </div>
      <Button size="sm" variant="ghost" onClick={view} data-testid={`view-file-${file.id}`}>
        <Eye className="h-3.5 w-3.5" />
      </Button>
      {!legacy && (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => onDelete(file.id)}
          data-testid={`delete-file-${file.id}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function DocSlot({
  doc,
  clinicId,
  isUploading,
  onUpload,
  onDelete,
  onAssignLoose,
}: {
  doc: DocConstitutivoData;
  clinicId: string;
  isUploading: boolean;
  onUpload: (docId: string, file: File) => void;
  onDelete: (docId: string, fileId: string) => void;
  onAssignLoose: (looseId: string, docId: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileCount = doc.files?.length ?? 0;
  const [expanded, setExpanded] = useState(fileCount === 0);
  const hasFiles = fileCount > 0;

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    // Did we receive a "soltos" buffer item being moved into this slot?
    const looseId = e.dataTransfer.getData("application/x-loose-file-id");
    if (looseId) {
      onAssignLoose(looseId, doc.id);
      setExpanded(true);
      return;
    }

    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === "application/pdf" || f.name.endsWith(".pdf")
    );
    files.forEach((file) => onUpload(doc.id, file));
    if (files.length > 0) setExpanded(true);
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`border-b last:border-0 transition-colors ${isDragOver ? "bg-primary/10" : ""}`}
      data-testid={`doc-slot-${doc.id}`}
    >
      <div className="flex items-center gap-3 py-3 px-2">
        <button
          type="button"
          className="shrink-0"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Recolher" : "Expandir"}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        <div className="shrink-0">
          {hasFiles
            ? <CheckCircle2 className="h-5 w-5 text-green-500" />
            : <Clock className="h-5 w-5 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{doc.nome}</p>
          <p className="text-xs text-muted-foreground">
            {isDragOver
              ? "Solte os PDFs aqui"
              : hasFiles
                ? `${fileCount} arquivo${fileCount > 1 ? "s" : ""} enviado${fileCount > 1 ? "s" : ""}`
                : "Pendente — arraste PDFs aqui ou clique em Adicionar"}
          </p>
        </div>
        {hasFiles && (
          <Badge variant="secondary" className="text-xs shrink-0">{fileCount}</Badge>
        )}
        {doc.obrigatorio && <Badge variant="outline" className="text-xs shrink-0">Obrigatório</Badge>}
        {isUploading && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
      </div>

      {expanded && (
        <div className="ml-9 mr-2 mb-3 space-y-2">
          {doc.files?.map((f) => (
            <FileLine
              key={f.id}
              file={f}
              clinicId={clinicId}
              docId={doc.id}
              onDelete={(fileId) => onDelete(doc.id, fileId)}
            />
          ))}
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-center"
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
            data-testid={`add-file-${doc.id}`}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar arquivo
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              files.forEach((file) => onUpload(doc.id, file));
              e.target.value = "";
            }}
          />
        </div>
      )}
    </div>
  );
}

function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.type === "application/pdf" || f.name.endsWith(".pdf")
    );
    if (files.length > 0) onFiles(files);
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileRef.current?.click()}
      className={`cursor-pointer border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        isDragOver ? "border-primary bg-primary/10" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/40"
      }`}
    >
      <Upload className={`h-8 w-8 mx-auto mb-3 transition-colors ${isDragOver ? "text-primary" : "text-muted-foreground"}`} />
      <p className="text-sm font-medium text-muted-foreground">
        {isDragOver ? "Solte os arquivos PDF aqui" : "Arraste arquivos PDF para fazer upload em lote"}
      </p>
      <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar múltiplos arquivos</p>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

interface LooseFile {
  id: string;
  file: File;
}

function LooseFilesPanel({
  loose,
  docs,
  onAssign,
  onRemove,
}: {
  loose: LooseFile[];
  docs: DocConstitutivoData[];
  onAssign: (looseId: string, docId: string) => void;
  onRemove: (looseId: string) => void;
}) {
  if (loose.length === 0) return null;

  return (
    <Card className="border-amber-300 bg-amber-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-amber-900">
          <FileText className="h-4 w-4" />
          Arquivos sem associação ({loose.length})
        </CardTitle>
        <p className="text-xs text-amber-800">
          Arraste cada arquivo até o documento correto, ou escolha pelo menu.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {loose.map((lf) => (
          <div
            key={lf.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-loose-file-id", lf.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="flex items-center gap-2 py-2 px-3 bg-white border border-amber-200 rounded text-sm cursor-grab active:cursor-grabbing"
            data-testid={`loose-file-${lf.id}`}
          >
            <FileText className="h-4 w-4 text-amber-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium" title={lf.file.name}>{lf.file.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatSize(lf.file.size)}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" data-testid={`assign-loose-${lf.id}`}>
                  <ArrowRight className="h-3.5 w-3.5 mr-1" /> Associar a…
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-72 overflow-auto">
                {docs.map((d) => (
                  <DropdownMenuItem key={d.id} onClick={() => onAssign(lf.id, d.id)}>
                    {d.nome}
                    <span className="text-xs text-muted-foreground ml-2">
                      ({d.categoria})
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => onRemove(lf.id)}
              data-testid={`remove-loose-${lf.id}`}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

let looseIdSeq = 0;
function nextLooseId(): string {
  looseIdSeq++;
  return `loose-${Date.now()}-${looseIdSeq}`;
}

export default function DocumentosConstitutivoTab({ clinicId }: Props) {
  const { toast } = useToast();
  const { data: docs = [], isLoading } = useDocsConstitutivos(clinicId);
  const addFile = useAddDocConstitutivoFile(clinicId);
  const deleteFile = useDeleteDocConstitutivoFile(clinicId);
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<{ docId: string; fileId: string } | null>(null);
  const [looseFiles, setLooseFiles] = useState<LooseFile[]>([]);

  function handleUpload(
    docId: string,
    file: File,
    callbacks?: { onSuccess?: () => void; onError?: () => void },
  ) {
    setUploading(s => new Set(s).add(docId));
    addFile.mutate(
      { docId, file },
      {
        onSuccess: () => {
          toast({ title: "Arquivo adicionado" });
          callbacks?.onSuccess?.();
        },
        onError: (e) => {
          toast({ variant: "destructive", title: "Erro no upload", description: (e as Error).message });
          callbacks?.onError?.();
        },
        onSettled: () => setUploading(s => { const n = new Set(s); n.delete(docId); return n; }),
      }
    );
  }

  function handleDeleteRequest(docId: string, fileId: string) {
    setPendingDelete({ docId, fileId });
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    deleteFile.mutate(pendingDelete, {
      onSuccess: () => toast({ title: "Arquivo removido" }),
      onError: (e) => toast({ variant: "destructive", title: "Erro ao remover", description: (e as Error).message }),
    });
    setPendingDelete(null);
  }

  function assignLooseFile(looseId: string, docId: string) {
    const lf = looseFiles.find((x) => x.id === looseId);
    if (!lf) return;
    // Only remove from the loose buffer once the upload succeeds. On failure,
    // the file stays so the user can retry without re-selecting it.
    handleUpload(docId, lf.file, {
      onSuccess: () => setLooseFiles((arr) => arr.filter((x) => x.id !== looseId)),
    });
  }

  function removeLoose(looseId: string) {
    setLooseFiles((arr) => arr.filter((x) => x.id !== looseId));
  }

  function handleBatchUpload(files: File[]) {
    const empty = docs.filter((d) => (d.files?.length ?? 0) === 0);
    const used = new Set<string>();
    const matched: Array<{ docId: string; file: File }> = [];
    const unmatched: File[] = [];

    for (const file of files) {
      const name = file.name.toLowerCase().replace(/[-_]/g, " ").replace(".pdf", "");
      const doc = empty.find(
        (d) =>
          !used.has(d.id) &&
          (d.nome.toLowerCase().includes(name) ||
            name.includes(d.nome.toLowerCase().substring(0, 6))),
      );
      if (doc) {
        used.add(doc.id);
        matched.push({ docId: doc.id, file });
      } else {
        unmatched.push(file);
      }
    }

    matched.forEach(({ docId, file }) => handleUpload(docId, file));

    if (unmatched.length > 0) {
      const newLoose = unmatched.map((f) => ({ id: nextLooseId(), file: f }));
      setLooseFiles((arr) => [...arr, ...newLoose]);
    }

    if (matched.length > 0 && unmatched.length === 0) {
      toast({ title: `${matched.length} arquivo(s) associados e enviados` });
    } else if (matched.length > 0 && unmatched.length > 0) {
      toast({
        title: `${matched.length} associados, ${unmatched.length} sem associação`,
        description: "Arraste os arquivos restantes para o documento correto.",
      });
    } else {
      toast({
        title: `${unmatched.length} arquivo(s) sem associação`,
        description: "Arraste cada arquivo para o documento correto.",
      });
    }
  }

  const mandatory = docs.filter(d => d.obrigatorio);
  const mandatorySent = mandatory.filter(d => (d.files?.length ?? 0) > 0);
  const progress = mandatory.length > 0 ? Math.round((mandatorySent.length / mandatory.length) * 100) : 0;

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;

  const busy = uploading.size > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Documentos obrigatórios enviados</span>
            <span className="text-sm font-semibold">{mandatorySent.length} / {mandatory.length}</span>
          </div>
          <Progress value={progress} className="h-2" />
          {progress === 100 && (
            <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Todos os documentos obrigatórios foram enviados
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" /> Upload em lote
            {busy && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DropZone onFiles={handleBatchUpload} />
        </CardContent>
      </Card>

      <LooseFilesPanel
        loose={looseFiles}
        docs={docs}
        onAssign={assignLooseFile}
        onRemove={removeLoose}
      />

      {CATEGORIES.map(cat => {
        const catDocs = docs.filter(d => d.categoria === cat);
        if (catDocs.length === 0) return null;
        const filled = catDocs.filter((d) => (d.files?.length ?? 0) > 0).length;
        return (
          <Card key={cat}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {cat}
                <Badge variant="secondary" className="text-xs">{filled}/{catDocs.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {catDocs.map(doc => (
                <DocSlot
                  key={doc.id}
                  doc={doc}
                  clinicId={clinicId}
                  isUploading={uploading.has(doc.id)}
                  onUpload={handleUpload}
                  onDelete={handleDeleteRequest}
                  onAssignLoose={assignLooseFile}
                />
              ))}
            </CardContent>
          </Card>
        );
      })}

      {docs.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>Nenhum documento cadastrado</p>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover arquivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O arquivo será removido permanentemente deste documento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
