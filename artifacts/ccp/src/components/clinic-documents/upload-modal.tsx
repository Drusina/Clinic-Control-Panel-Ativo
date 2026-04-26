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
import { Upload, X, Check, AlertCircle, Loader2 } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { ClinicDocumentCategory } from "@/hooks/use-clinic-documents";
import { FileIcon, formatBytes } from "./file-icon";
import { cn } from "@/lib/utils";

type UploadStatus = "pending" | "uploading" | "done" | "error" | "rejected";

interface QueuedFile {
  id: string;
  file: File;
  status: UploadStatus;
  errorMessage?: string;
}

export function UploadModal({
  open,
  onOpenChange,
  categories,
  initialCategoryId,
  uploadOne,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: ClinicDocumentCategory[];
  initialCategoryId?: string;
  uploadOne: (categoryId: string, file: File) => Promise<unknown>;
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

  async function startUpload() {
    if (!categoryId || queue.length === 0) return;
    setRunning(true);
    for (const item of queue) {
      if (item.status === "done" || item.status === "rejected") continue;
      setQueue((q) =>
        q.map((x) => (x.id === item.id ? { ...x, status: "uploading", errorMessage: undefined } : x)),
      );
      try {
        await uploadOne(categoryId, item.file);
        setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "done" } : x)));
      } catch (err) {
        setQueue((q) =>
          q.map((x) =>
            x.id === item.id
              ? { ...x, status: "error", errorMessage: (err as Error).message }
              : x,
          ),
        );
      }
    }
    setRunning(false);
  }

  const allDone = queue.length > 0 && queue.every((x) => x.status === "done" || x.status === "rejected");
  const anyPendingOrFailed = queue.some(
    (x) => x.status === "pending" || x.status === "error",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload em lote</DialogTitle>
          <DialogDescription>
            Selecione uma categoria e os arquivos. Cada arquivo é enviado individualmente — falhas podem ser repetidas.
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
            <div className="border rounded-md max-h-72 overflow-y-auto divide-y">
              {queue.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center gap-3 p-3 text-sm"
                  data-testid={`queue-item-${q.status}`}
                >
                  <FileIcon mime={q.file.type} fileName={q.file.name} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{q.file.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(q.file.size)}
                      {q.errorMessage && (
                        <span className="text-destructive"> · {q.errorMessage}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {q.status === "uploading" && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                    {q.status === "done" && <Check className="h-4 w-4 text-green-600" />}
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
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            {allDone ? "Fechar" : "Cancelar"}
          </Button>
          <Button
            type="button"
            onClick={startUpload}
            disabled={running || !categoryId || queue.length === 0 || !anyPendingOrFailed}
            data-testid="btn-start-upload"
            className={cn(allDone && "hidden")}
          >
            {running && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enviar {queue.filter((x) => x.status !== "done" && x.status !== "rejected").length}{" "}
            {queue.filter((x) => x.status !== "done" && x.status !== "rejected").length === 1 ? "arquivo" : "arquivos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
