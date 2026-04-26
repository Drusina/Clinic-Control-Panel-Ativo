import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Eye, Download, Trash2, Sparkles, FileQuestion, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  type ClinicDocument,
  type ClinicDocumentCategory,
  getClinicDocumentSignedUrl,
  isSummarizableMime,
  useSummarizeClinicDocument,
} from "@/hooks/use-clinic-documents";
import { FileIcon, formatBytes, getFileKind } from "./file-icon";
import { downloadUrl } from "@/lib/download";

export function DetailPanel({
  doc,
  category,
  clinicId,
  onDelete,
  isDeleting,
}: {
  doc: ClinicDocument | null;
  category: ClinicDocumentCategory | null;
  clinicId: string;
  onDelete: (docId: string) => void;
  isDeleting: boolean;
}) {
  const { toast } = useToast();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const summarize = useSummarizeClinicDocument(clinicId);

  useEffect(() => {
    setPreviewUrl(null);
    if (!doc) return;
    let cancelled = false;
    setLoadingUrl(true);
    getClinicDocumentSignedUrl(clinicId, doc.id)
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingUrl(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doc, clinicId]);

  if (!doc) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FileQuestion className="h-12 w-12 mb-3 opacity-40" />
        <p className="text-sm">Selecione um documento para visualizar.</p>
      </div>
    );
  }

  const kind = getFileKind(doc.fileType, doc.fileName);

  async function openInNewTab() {
    let url = previewUrl;
    if (!url) {
      try {
        url = await getClinicDocumentSignedUrl(clinicId, doc!.id);
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Não foi possível abrir o arquivo",
          description: (err as Error).message,
        });
        return;
      }
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function downloadFile() {
    let url = previewUrl;
    if (!url) {
      try {
        url = await getClinicDocumentSignedUrl(clinicId, doc!.id);
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Não foi possível baixar",
          description: (err as Error).message,
        });
        return;
      }
    }
    const result = downloadUrl(url, doc!.fileName);
    if (result === "blocked") {
      toast({
        variant: "destructive",
        title: "Download bloqueado pelo navegador",
        description:
          "Seu navegador bloqueou a abertura. Permita pop-ups deste site para baixar o arquivo.",
      });
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-4 space-y-3">
        <div className="flex items-start gap-3">
          <FileIcon
            mime={doc.fileType}
            fileName={doc.fileName}
            className="h-6 w-6 shrink-0 mt-0.5"
          />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold leading-tight" data-testid="doc-title">
              {doc.title}
            </h2>
            <p className="text-sm text-muted-foreground truncate" title={doc.fileName}>
              {doc.fileName}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {category && <Badge variant="outline">{category.name}</Badge>}
          <Badge variant="outline">{formatBytes(doc.fileSize)}</Badge>
          <Badge variant="outline">
            Enviado em {new Date(doc.createdAt).toLocaleDateString("pt-BR")}
          </Badge>
          {doc.fileType && (
            <Badge variant="outline" className="font-mono">
              {doc.fileType}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={openInNewTab}
            data-testid="btn-view-doc"
          >
            <Eye className="h-4 w-4 mr-2" />
            Visualizar
          </Button>
          <Button size="sm" variant="outline" onClick={downloadFile} data-testid="btn-download-doc">
            <Download className="h-4 w-4 mr-2" />
            Baixar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={isDeleting}
            data-testid="btn-delete-doc"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Excluir
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <section>
          <h3 className="text-sm font-semibold mb-2">Pré-visualização</h3>
          {loadingUrl && (
            <div className="flex items-center justify-center h-40 border rounded-md text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Carregando…
            </div>
          )}
          {!loadingUrl && previewUrl && kind === "pdf" && (
            <iframe
              src={previewUrl}
              title={doc.fileName}
              className="w-full h-[60vh] border rounded-md bg-white"
            />
          )}
          {!loadingUrl && previewUrl && kind === "image" && (
            <img
              src={previewUrl}
              alt={doc.fileName}
              className="max-h-[60vh] mx-auto border rounded-md bg-card"
            />
          )}
          {!loadingUrl && previewUrl && kind !== "pdf" && kind !== "image" && (
            <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
              Pré-visualização não disponível para este tipo de arquivo.
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={downloadFile}>
                  <Download className="h-4 w-4 mr-2" />
                  Baixar para visualizar
                </Button>
              </div>
            </div>
          )}
          {!loadingUrl && !previewUrl && (
            <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
              Não foi possível obter a pré-visualização.
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Resumo IA
          </h3>
          <div className="border rounded-md p-4 bg-accent/20">
            {doc.summary ? (
              <>
                <p className="text-sm whitespace-pre-wrap" data-testid="text-doc-summary">
                  {doc.summary}
                </p>
                {doc.summarizedAt && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Gerado em{" "}
                    {new Date(doc.summarizedAt).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {isSummarizableMime(doc.fileType)
                  ? "Gere um resumo executivo automático deste documento."
                  : "Resumo automático disponível apenas para PDF e arquivos de texto."}
              </p>
            )}
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              disabled={
                summarize.isPending || !isSummarizableMime(doc.fileType)
              }
              title={
                !isSummarizableMime(doc.fileType)
                  ? "Apenas PDF e texto"
                  : undefined
              }
              data-testid="btn-summarize-doc"
              onClick={() => {
                summarize.mutate(doc.id, {
                  onSuccess: () => {
                    toast({
                      title: "Resumo gerado",
                      description: "O resumo foi atualizado.",
                    });
                  },
                  onError: (err) => {
                    toast({
                      variant: "destructive",
                      title: "Falha ao gerar resumo",
                      description: (err as Error).message,
                    });
                  },
                });
              }}
            >
              {summarize.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {summarize.isPending
                ? "Gerando…"
                : doc.summary
                  ? "Regenerar resumo"
                  : "Gerar resumo"}
            </Button>
          </div>
        </section>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá <strong>{doc.title}</strong> permanentemente. Não é possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                onDelete(doc.id);
                setConfirmOpen(false);
              }}
              data-testid="btn-confirm-delete"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
