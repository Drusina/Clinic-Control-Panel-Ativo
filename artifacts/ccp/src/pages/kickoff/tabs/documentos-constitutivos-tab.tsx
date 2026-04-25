import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Eye, FileText, CheckCircle2, Clock } from "lucide-react";
import { useDocsConstitutivos, useUploadDocConstitutivo, getSignedUrl, type DocConstitutivoData } from "@/hooks/use-kickoff-api";

interface Props { clinicId: string }

const CATEGORIES = ["Jurídico", "Funcionamento", "Financeiro", "Estrutura", "Seguros"];

function formatSize(bytes?: number | null) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DocRow({ doc, clinicId, onUpload }: {
  doc: DocConstitutivoData;
  clinicId: string;
  onUpload: (docId: string, file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  async function view() {
    try {
      const url = await getSignedUrl(clinicId, doc.id);
      window.open(url, "_blank");
    } catch {
      alert("Erro ao obter URL do documento");
    }
  }

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
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type === "application/pdf" || file.name.endsWith(".pdf"))) {
      onUpload(doc.id, file);
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex items-center gap-3 py-3 px-2 border-b last:border-0 rounded transition-colors ${isDragOver ? "bg-primary/10 border border-dashed border-primary" : ""}`}
    >
      <div className="shrink-0">
        {doc.storagePath
          ? <CheckCircle2 className="h-5 w-5 text-green-500" />
          : <Clock className="h-5 w-5 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{doc.nome}</p>
        <p className="text-xs text-muted-foreground">
          {isDragOver
            ? "Solte o PDF aqui"
            : doc.storagePath
              ? `Enviado em ${doc.enviadoEm ? new Date(doc.enviadoEm).toLocaleDateString("pt-BR") : "—"} · ${formatSize(doc.tamanho) ?? ""}`
              : "Pendente — arraste um PDF aqui ou clique em Enviar"}
        </p>
      </div>
      {doc.obrigatorio && <Badge variant="outline" className="text-xs shrink-0">Obrigatório</Badge>}
      <div className="flex gap-2 shrink-0">
        {doc.storagePath && (
          <Button size="sm" variant="outline" onClick={view}>
            <Eye className="h-3.5 w-3.5 mr-1" /> Visualizar
          </Button>
        )}
        <Button
          size="sm"
          variant={doc.storagePath ? "ghost" : "outline"}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5 mr-1" /> {doc.storagePath ? "Substituir" : "Enviar"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onUpload(doc.id, file);
            e.target.value = "";
          }}
        />
      </div>
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

export default function DocumentosConstitutivoTab({ clinicId }: Props) {
  const { toast } = useToast();
  const { data: docs = [], isLoading } = useDocsConstitutivos(clinicId);
  const upload = useUploadDocConstitutivo(clinicId);
  const [uploading, setUploading] = useState<Set<string>>(new Set());

  function handleUpload(docId: string, file: File) {
    setUploading(s => new Set(s).add(docId));
    upload.mutate(
      { docId, file },
      {
        onSuccess: () => toast({ title: "Documento enviado com sucesso" }),
        onError: (e) => toast({ variant: "destructive", title: "Erro no upload", description: (e as Error).message }),
        onSettled: () => setUploading(s => { const n = new Set(s); n.delete(docId); return n; }),
      }
    );
  }

  function handleBatchUpload(files: File[]) {
    const pending = docs.filter(d => !d.storagePath);
    const matched: Array<{ doc: DocConstitutivoData; file: File }> = [];

    for (const file of files) {
      const name = file.name.toLowerCase().replace(/[-_]/g, " ").replace(".pdf", "");
      const doc = pending.find(d =>
        !matched.find(m => m.doc.id === d.id) &&
        (d.nome.toLowerCase().includes(name) || name.includes(d.nome.toLowerCase().substring(0, 6)))
      );
      if (doc) matched.push({ doc, file });
    }

    if (matched.length > 0) {
      matched.forEach(({ doc, file }) => handleUpload(doc.id, file));
      toast({ title: `${matched.length} arquivo(s) associados e enviados` });
    } else {
      toast({ title: `${files.length} arquivo(s) carregados`, description: "Use os botões individuais para associar cada arquivo ao documento correto." });
    }
  }

  const mandatory = docs.filter(d => d.obrigatorio);
  const mandatorySent = mandatory.filter(d => !!d.storagePath);
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

      {CATEGORIES.map(cat => {
        const catDocs = docs.filter(d => d.categoria === cat);
        if (catDocs.length === 0) return null;
        return (
          <Card key={cat}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {cat}
                <Badge variant="secondary" className="text-xs">{catDocs.filter(d => !!d.storagePath).length}/{catDocs.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {catDocs.map(doc => (
                <DocRow key={doc.id} doc={doc} clinicId={clinicId} onUpload={handleUpload} />
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
    </div>
  );
}
