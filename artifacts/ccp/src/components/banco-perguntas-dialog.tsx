import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getStoredToken } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Upload, FilePlus, CheckCircle2, AlertTriangle, RotateCcw } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ImportResult {
  inserted: number;
  updated: number;
  invalid: { row: number; error: string }[];
  dryRun?: boolean;
}

async function uploadPerguntasFile(file: File, dryRun: boolean): Promise<ImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  const token = getStoredToken();
  const url = `${BASE}/api/perguntas/import-file${dryRun ? "?dryRun=true" : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error ?? `Falha ao importar (HTTP ${res.status})`);
  }
  return json as ImportResult;
}

export function BancoPerguntasDialog({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  /** Called after a successful import or seed reset so the parent can refresh. */
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);

  const invalidateAfterChange = () => {
    qc.invalidateQueries({ queryKey: ["delegacao-hydrated"] });
    qc.invalidateQueries({ queryKey: ["listAllPerguntas"] });
    qc.invalidateQueries({ queryKey: ["listDiagnosticPillars"] });
    onChanged?.();
  };

  const handleFile = async (file: File) => {
    setPendingFile(file);
    setPreview(null);
    setLastResult(null);
    setPreviewing(true);
    try {
      const result = await uploadPerguntasFile(file, true);
      setPreview(result);
    } catch (err) {
      setPendingFile(null);
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ variant: "destructive", title: "Falha no preview", description: msg });
    } finally {
      setPreviewing(false);
    }
  };

  const handleConfirm = async () => {
    if (!pendingFile) return;
    setConfirming(true);
    try {
      const result = await uploadPerguntasFile(pendingFile, false);
      setLastResult(result);
      setPreview(null);
      setPendingFile(null);
      toast({
        title: "Importação concluída",
        description: `${result.inserted} inseridas · ${result.updated} atualizadas · ${result.invalid.length} inválidas.`,
      });
      invalidateAfterChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ variant: "destructive", title: "Falha ao importar", description: msg });
    } finally {
      setConfirming(false);
    }
  };

  const handleCancelPreview = () => {
    setPreview(null);
    setPendingFile(null);
  };

  const resetMut = useMutation({
    mutationFn: async (): Promise<{ inserted: number; total: number }> => {
      const token = getStoredToken();
      const res = await fetch(`${BASE}/api/perguntas/reset-to-seed`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Falha");
      return json;
    },
    onSuccess: (data) => {
      toast({
        title: "Banco restaurado",
        description: `${data.inserted ?? 0} novas inseridas (total: ${data.total ?? "—"}).`,
      });
      invalidateAfterChange();
    },
    onError: (err) =>
      toast({
        variant: "destructive",
        title: "Erro",
        description: err instanceof Error ? err.message : "",
      }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Banco de perguntas</DialogTitle>
          <DialogDescription>
            Importe perguntas via planilha CSV/XLSX ou restaure o banco padrão. Mudanças aqui
            afetam todos os diagnósticos futuros.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto pr-1 flex-1">
          <div className="border rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              <span className="font-medium text-sm">Importar planilha</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Cabeçalhos aceitos (qualquer caixa/acento):{" "}
              <code className="font-mono">pilarSlug, pilarNome, pilarOrdem, texto, tipo, peso, ordem, dica, valorMin, valorMax, inverso</code>.
              Limite 2MB. Linhas com o mesmo (pilarSlug, ordem) são <strong>atualizadas</strong>; o
              resto é inserido.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              data-testid="input-perguntas-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={previewing || confirming}
                onClick={() => fileInputRef.current?.click()}
                data-testid="btn-perguntas-select-file"
              >
                {previewing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Selecionar arquivo
              </Button>
              {pendingFile && (
                <span className="text-xs text-muted-foreground self-center">
                  {pendingFile.name}
                </span>
              )}
            </div>

            {preview && (
              <div
                className="mt-2 rounded-md border bg-muted/40 p-3 space-y-2"
                data-testid="perguntas-preview"
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Pré-visualização — nada foi salvo ainda
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded bg-emerald-50 border border-emerald-200 py-2">
                    <div className="text-xl font-semibold text-emerald-700" data-testid="preview-inserted">
                      {preview.inserted}
                    </div>
                    <div className="text-xs text-emerald-700">Novas</div>
                  </div>
                  <div className="rounded bg-blue-50 border border-blue-200 py-2">
                    <div className="text-xl font-semibold text-blue-700" data-testid="preview-updated">
                      {preview.updated}
                    </div>
                    <div className="text-xs text-blue-700">Atualizadas</div>
                  </div>
                  <div className="rounded bg-red-50 border border-red-200 py-2">
                    <div className="text-xl font-semibold text-red-700" data-testid="preview-invalid">
                      {preview.invalid.length}
                    </div>
                    <div className="text-xs text-red-700">Inválidas</div>
                  </div>
                </div>
                {preview.invalid.length > 0 && (
                  <details className="text-xs text-destructive">
                    <summary className="cursor-pointer flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Ver erros ({preview.invalid.length})
                    </summary>
                    <ul className="list-disc pl-5 mt-1 max-h-40 overflow-y-auto space-y-0.5">
                      {preview.invalid.slice(0, 100).map((i) => (
                        <li key={i.row}>
                          Linha {i.row}: {i.error}
                        </li>
                      ))}
                      {preview.invalid.length > 100 && (
                        <li>… e mais {preview.invalid.length - 100} linhas.</li>
                      )}
                    </ul>
                  </details>
                )}
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={handleConfirm}
                    disabled={confirming || preview.inserted + preview.updated === 0}
                    data-testid="btn-perguntas-confirm"
                  >
                    {confirming && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Confirmar importação
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCancelPreview}
                    disabled={confirming}
                  >
                    Cancelar
                  </Button>
                </div>
                {preview.inserted + preview.updated === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma linha válida — corrija a planilha e tente novamente.
                  </p>
                )}
              </div>
            )}

            {lastResult && (
              <div
                className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800"
                data-testid="perguntas-last-result"
              >
                ✓ Inseridas: {lastResult.inserted} · Atualizadas: {lastResult.updated} · Inválidas:{" "}
                {lastResult.invalid.length}
              </div>
            )}
          </div>

          <div className="border rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2">
              <FilePlus className="h-4 w-4" />
              <span className="font-medium text-sm">Restaurar banco padrão</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Insere as perguntas do seed inicial que não existem (idempotente — não duplica). Não
              remove perguntas customizadas.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={resetMut.isPending}
              onClick={() => resetMut.mutate()}
              data-testid="btn-perguntas-reset-seed"
            >
              {resetMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Restaurar seed
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Para editar perguntas individuais, use a tela de Delegação (ícones de lápis/lixeira em
            cada pilar).
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
