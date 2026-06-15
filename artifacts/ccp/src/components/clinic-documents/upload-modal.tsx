import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  X,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  CopyCheck,
} from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  ApiError,
  type ClinicDocument,
  type ClinicDocumentCategory,
  type DuplicateConflictBody,
  type SuggestTitleResponse,
} from "@/hooks/use-clinic-documents";
import { FileIcon, formatBytes } from "./file-icon";
import { cn } from "@/lib/utils";

type UploadStatus =
  | "pending"
  | "uploading"
  | "duplicate"
  | "naming"
  | "done"
  | "error"
  | "rejected";

interface QueuedFile {
  id: string;
  file: File;
  status: UploadStatus;
  errorMessage?: string;
  /** Created document id (available once uploaded). */
  docId?: string;
  /** Editable title shown in the inline field. */
  titleDraft?: string;
  /** Title that is currently persisted on the server. */
  savedTitle?: string;
  /** Where the suggested title came from. */
  titleSource?: "ai" | "filename";
  /** The existing document this file duplicates. */
  duplicateOf?: DuplicateConflictBody["duplicateOf"];
  savingTitle?: boolean;
}

export function UploadModal({
  open,
  onOpenChange,
  categories,
  initialCategoryId,
  uploadOne,
  suggestTitleFor,
  renameDocument,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: ClinicDocumentCategory[];
  initialCategoryId?: string;
  uploadOne: (
    categoryId: string,
    file: File,
    allowDuplicate?: boolean,
  ) => Promise<ClinicDocument>;
  suggestTitleFor: (id: string) => Promise<SuggestTitleResponse>;
  renameDocument: (id: string, title: string) => Promise<void>;
}) {
  const [categoryId, setCategoryId] = useState<string>(initialCategoryId ?? categories[0]?.id ?? "");
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQueue([]);
      setCategoryId(initialCategoryId ?? categories[0]?.id ?? "");
    }
  }, [open, initialCategoryId, categories]);

  const ALLOWED_MIME_TYPES = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/tiff",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "application/zip",
    "application/x-zip-compressed",
  ]);

  function patch(id: string, fields: Partial<QueuedFile>) {
    setQueue((q) => q.map((x) => (x.id === id ? { ...x, ...fields } : x)));
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next: QueuedFile[] = Array.from(files).map((f) => {
      const allowed = ALLOWED_MIME_TYPES.has(f.type);
      return {
        id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        status: allowed ? "pending" : "rejected",
        errorMessage: allowed
          ? undefined
          : `Tipo de arquivo não permitido: ${f.type || "desconhecido"}`,
      };
    });
    setQueue((q) => [...q, ...next]);
  }

  function removeFile(id: string) {
    setQueue((q) => q.filter((x) => x.id !== id));
  }

  // Uploads a single file, then asks the backend to suggest an objective title.
  async function processItem(item: QueuedFile, allowDuplicate: boolean) {
    patch(item.id, {
      status: "uploading",
      errorMessage: undefined,
      duplicateOf: undefined,
    });

    let doc: ClinicDocument;
    try {
      doc = await uploadOne(categoryId, item.file, allowDuplicate);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as DuplicateConflictBody;
        patch(item.id, {
          status: "duplicate",
          errorMessage: body.error,
          duplicateOf: body.duplicateOf,
        });
      } else {
        patch(item.id, {
          status: "error",
          errorMessage: (err as Error).message,
        });
      }
      return;
    }

    // Uploaded — now generate the AI title (applied server-side by default).
    patch(item.id, {
      status: "naming",
      docId: doc.id,
      titleDraft: doc.title,
      savedTitle: doc.title,
    });

    try {
      const res = await suggestTitleFor(doc.id);
      patch(item.id, {
        status: "done",
        titleDraft: res.title,
        savedTitle: res.title,
        titleSource: res.source,
      });
    } catch {
      // Suggestion call failed entirely — keep the filename-based title.
      patch(item.id, {
        status: "done",
        titleSource: "filename",
      });
    }
  }

  async function startUpload() {
    if (!categoryId || queue.length === 0) return;
    setRunning(true);
    // Snapshot ids to process so state updates inside the loop don't reshuffle.
    const toProcess = queue.filter(
      (x) => x.status === "pending" || x.status === "error",
    );
    for (const item of toProcess) {
      await processItem(item, false);
    }
    setRunning(false);
  }

  async function overrideDuplicate(item: QueuedFile) {
    setRunning(true);
    await processItem(item, true);
    setRunning(false);
  }

  async function saveTitle(item: QueuedFile) {
    if (!item.docId) return;
    const newTitle = (item.titleDraft ?? "").trim();
    if (!newTitle) return;
    patch(item.id, { savingTitle: true });
    try {
      await renameDocument(item.docId, newTitle);
      patch(item.id, { savingTitle: false, savedTitle: newTitle });
    } catch (err) {
      patch(item.id, {
        savingTitle: false,
        errorMessage: (err as Error).message,
      });
    }
  }

  const pendingCount = queue.filter(
    (x) => x.status === "pending" || x.status === "error",
  ).length;
  const allSettled =
    queue.length > 0 &&
    queue.every(
      (x) =>
        x.status === "done" || x.status === "rejected" || x.status === "duplicate",
    );
  const allDoneOrRejected =
    queue.length > 0 &&
    queue.every((x) => x.status === "done" || x.status === "rejected");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload em lote</DialogTitle>
          <DialogDescription>
            Selecione uma categoria e os arquivos. Documentos idênticos são
            detectados automaticamente, e cada arquivo recebe um nome objetivo
            sugerido por IA — que você pode editar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Categoria de destino</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger data-testid="select-upload-category">
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover:bg-accent/30 transition-colors"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
            data-testid="upload-dropzone"
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm mt-2">
              Clique para selecionar ou arraste arquivos aqui (até 50MB cada)
            </p>
            <input
              type="file"
              multiple
              ref={inputRef}
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.tif,.tiff,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,application/pdf,image/jpeg,image/png,image/gif,image/webp,image/tiff,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,application/zip"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {queue.length > 0 && (
            <div className="border rounded-md max-h-80 overflow-y-auto divide-y">
              {queue.map((q) => (
                <div
                  key={q.id}
                  className="flex flex-col gap-2 p-3 text-sm"
                  data-testid={`queue-item-${q.status}`}
                >
                  <div className="flex items-center gap-3">
                    <FileIcon mime={q.file.type} fileName={q.file.name} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{q.file.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(q.file.size)}
                        {q.errorMessage && q.status !== "duplicate" && (
                          <span className="text-destructive"> · {q.errorMessage}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {q.status === "uploading" && (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      )}
                      {q.status === "naming" && (
                        <Sparkles className="h-4 w-4 animate-pulse text-primary" />
                      )}
                      {q.status === "done" && <Check className="h-4 w-4 text-green-600" />}
                      {q.status === "duplicate" && (
                        <CopyCheck className="h-4 w-4 text-amber-500" />
                      )}
                      {(q.status === "error" || q.status === "rejected") && (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      )}
                      {!running && q.status !== "done" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removeFile(q.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {q.status === "naming" && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground pl-9">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Gerando nome com IA…
                    </div>
                  )}

                  {q.status === "duplicate" && q.duplicateOf && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 ml-9 space-y-2">
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        {q.errorMessage} Já existe como{" "}
                        <span className="font-medium">
                          “{q.duplicateOf.title}” (#{q.duplicateOf.sequenceNumber})
                        </span>
                        .
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7"
                        disabled={running}
                        onClick={() => overrideDuplicate(q)}
                        data-testid={`btn-override-duplicate-${q.id}`}
                      >
                        Enviar mesmo assim
                      </Button>
                    </div>
                  )}

                  {q.status === "done" && q.docId && (
                    <div className="ml-9 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">
                          Nome do documento
                        </Label>
                        {q.titleSource === "ai" ? (
                          <Badge variant="secondary" className="h-5 gap-1 text-[10px]">
                            <Sparkles className="h-3 w-3" /> Sugerido por IA
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="h-5 text-[10px]">
                            Do nome do arquivo
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          value={q.titleDraft ?? ""}
                          maxLength={180}
                          onChange={(e) => patch(q.id, { titleDraft: e.target.value })}
                          className="h-8"
                          data-testid={`input-doc-title-${q.id}`}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0"
                          disabled={
                            q.savingTitle ||
                            !(q.titleDraft ?? "").trim() ||
                            (q.titleDraft ?? "").trim() === q.savedTitle
                          }
                          onClick={() => saveTitle(q)}
                          data-testid={`btn-save-title-${q.id}`}
                        >
                          {q.savingTitle ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (q.titleDraft ?? "").trim() === q.savedTitle ? (
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            "Salvar nome"
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            {allSettled ? "Fechar" : "Cancelar"}
          </Button>
          <Button
            type="button"
            onClick={startUpload}
            disabled={running || !categoryId || pendingCount === 0}
            data-testid="btn-start-upload"
            className={cn(allDoneOrRejected && "hidden")}
          >
            {running && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enviar {pendingCount} {pendingCount === 1 ? "arquivo" : "arquivos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
