import { useRef, useState, type ReactNode, type RefObject } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import {
  Download,
  Upload,
  FileSpreadsheet,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { useToast } from "@/hooks/use-toast";
import { getStoredToken } from "@/hooks/use-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; field?: string; message: string }[];
}

interface UseCadastroPlanilhaOptions {
  clinicId: string;
  /** Path segment after `/api/clinics/:clinicId/` — e.g. "team", "parceiros-externos", "sistemas-uso". */
  resourcePath: string;
  /** Fallback filename used when the response has no Content-Disposition header. */
  defaultFilename: string;
  /** React Query key invalidated after a successful import. */
  invalidateKey: QueryKey;
  /** Builds the export-success toast description, e.g. `(n) => \`${n} membro(s) incluídos.\``. */
  exportToastDescription: (count: number) => string;
  /** Current item count, used only for the export-success toast description. */
  itemCount: number;
}

/**
 * Shared "cadastral list" spreadsheet logic (download template, export, import)
 * used by the Equipe, Rede Externa and Sistemas e Acessos tabs. Each tab only
 * differs by its resource path, filename and query key — the fetch/blob/import
 * flow is identical, so it lives here once.
 */
export function useCadastroPlanilha(opts: UseCadastroPlanilhaOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [downloading, setDownloading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadXlsx = async (kind: "template" | "export") => {
    const setLoading = kind === "template" ? setDownloading : setExporting;
    setLoading(true);
    try {
      const token = getStoredToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(
        `${BASE}/api/clinics/${opts.clinicId}/${opts.resourcePath}/${kind}`,
        { headers },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? res.statusText);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || opts.defaultFilename;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      if (kind === "export") {
        toast({
          title: "Planilha exportada",
          description: opts.exportToastDescription(opts.itemCount),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao baixar planilha";
      toast({
        variant: "destructive",
        title: kind === "template" ? "Erro ao baixar modelo" : "Erro ao exportar",
        description: message,
      });
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

  const handleFilePicked = (file: File | null) => {
    setSelectedFile(file);
    setImportSummary(null);
    setImportError(null);
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
      const res = await fetch(
        `${BASE}/api/clinics/${opts.clinicId}/${opts.resourcePath}/import`,
        { method: "POST", headers, body: formData },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) {
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setImportSummary(data as ImportSummary);
      queryClient.invalidateQueries({ queryKey: opts.invalidateKey });
      const summary = data as ImportSummary;
      if (res.status === 409) {
        setImportError((data as { error?: string }).error ?? "Importação revertida.");
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

  return {
    downloading,
    exporting,
    importing,
    isImportOpen,
    setIsImportOpen,
    importSummary,
    importError,
    selectedFile,
    fileInputRef,
    downloadXlsx,
    openImport,
    handleFilePicked,
    submitImport,
  };
}

interface CadastroToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onBaixarModelo: () => void;
  downloading: boolean;
  onExportar: () => void;
  exporting: boolean;
  exportDisabled: boolean;
  exportDisabledTitle?: string;
  onImportar: () => void;
  addLabel: string;
  onAdicionar: () => void;
}

/**
 * Header actions row shared by the cadastral list tabs: Cards/Tabela toggle +
 * Baixar modelo + Exportar planilha + Importar planilha + Adicionar.
 */
export function CadastroToolbar({
  viewMode,
  onViewModeChange,
  onBaixarModelo,
  downloading,
  onExportar,
  exporting,
  exportDisabled,
  exportDisabledTitle,
  onImportar,
  addLabel,
  onAdicionar,
}: CadastroToolbarProps) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <ViewToggle mode={viewMode} onChange={onViewModeChange} className="mr-1" />
      <Button variant="outline" onClick={onBaixarModelo} disabled={downloading}>
        {downloading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Download className="mr-2 h-4 w-4" />
        )}
        Baixar modelo
      </Button>
      <Button
        variant="outline"
        onClick={onExportar}
        disabled={exporting || exportDisabled}
        title={exportDisabled ? exportDisabledTitle : undefined}
      >
        {exporting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <FileSpreadsheet className="mr-2 h-4 w-4" />
        )}
        Exportar planilha
      </Button>
      <Button variant="outline" onClick={onImportar}>
        <Upload className="mr-2 h-4 w-4" /> Importar planilha
      </Button>
      <Button onClick={onAdicionar}>
        <Plus className="mr-2 h-4 w-4" /> {addLabel}
      </Button>
    </div>
  );
}

interface ImportPlanilhaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  importing: boolean;
  selectedFile: File | null;
  onFileChange: (file: File | null) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  importError: string | null;
  importSummary: ImportSummary | null;
  onSubmit: () => void;
}

/**
 * Shared spreadsheet import dialog (file picker + error + result summary) for
 * the cadastral list tabs. The title/description are entity-specific; the rest
 * is identical across tabs.
 */
export function ImportPlanilhaDialog({
  open,
  onOpenChange,
  title,
  description,
  importing,
  selectedFile,
  onFileChange,
  fileInputRef,
  importError,
  importSummary,
  onSubmit,
}: ImportPlanilhaDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!importing) onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-md border p-3">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              {selectedFile ? (
                <>
                  <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum arquivo selecionado</p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              Selecionar
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
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
                    {importSummary.created} criados · {importSummary.updated} atualizados ·{" "}
                    {importSummary.skipped} ignorados
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
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={importing}
          >
            {importSummary ? "Fechar" : "Cancelar"}
          </Button>
          <Button onClick={onSubmit} disabled={!selectedFile || importing}>
            {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {importSummary ? "Importar novamente" : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
