import { useRef, useState } from "react";
import type { Clinic, DocumentoComercial } from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Upload,
  ExternalLink,
  Trash2,
  FileText,
  FileSignature,
  Sparkles,
  Send,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { getStoredToken } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
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
import { clinicToSnapshot, conditionsDiffer } from "./shared";

type Tipo = "proposta" | "contrato";

const META: Record<
  Tipo,
  {
    title: string;
    desc: string;
    uploaded: string;
    gerar: string;
    enviar: string;
    icon: typeof FileText;
  }
> = {
  proposta: {
    title: "Proposta",
    desc: "Documento enviado ao cliente com as condições negociadas.",
    uploaded: "Proposta enviada",
    gerar: "Gerar Proposta",
    enviar: "Enviar ao Cliente",
    icon: FileText,
  },
  contrato: {
    title: "Contrato",
    desc: "Contrato formal de prestação de serviços CLINIONEX360.",
    uploaded: "Contrato assinado",
    gerar: "Gerar Contrato",
    enviar: "Enviar para Assinatura",
    icon: FileSignature,
  },
};

export function DocumentoComercialCard({
  clinic,
  tipo,
  latestDoc,
  onChanged,
}: {
  clinic: Clinic;
  tipo: Tipo;
  latestDoc?: DocumentoComercial;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const meta = META[tipo];
  const Icon = meta.icon;
  const url = tipo === "proposta" ? clinic.propostaUrl : clinic.contratoUrl;

  const showDrift =
    !!latestDoc?.snapshot &&
    conditionsDiffer(clinicToSnapshot(clinic), latestDoc.snapshot);

  const openDocument = async (u: string) => {
    if (!u.startsWith("/api/storage/objects/")) {
      window.open(u, "_blank", "noopener,noreferrer");
      return;
    }
    const token = getStoredToken();
    try {
      const signedReqUrl = new URL(u, window.location.origin);
      signedReqUrl.searchParams.set("signed", "true");
      const signedRes = await fetch(signedReqUrl.toString(), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!signedRes.ok) {
        toast({ variant: "destructive", title: "Não foi possível abrir o documento" });
        return;
      }
      const { url: signedUrl } = (await signedRes.json()) as { url: string };
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast({ variant: "destructive", title: "Erro ao abrir o documento" });
    }
  };

  const handleUpload = async (file: File) => {
    if (file.type !== "application/pdf") {
      toast({ variant: "destructive", title: "Apenas arquivos PDF são aceitos" });
      return;
    }
    setUploading(true);
    try {
      const token = getStoredToken();
      const res = await fetch(`/api/clinics/${clinic.id}/documents?type=${tipo}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: file,
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast({
          variant: "destructive",
          title: "Erro no upload",
          description: err.error ?? "Erro desconhecido",
        });
        return;
      }
      toast({
        title: `${meta.title} enviada`,
        description: `Arquivo ${file.name} enviado com sucesso.`,
      });
      onChanged();
    } catch {
      toast({ variant: "destructive", title: "Erro de conexão ao fazer upload" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const token = getStoredToken();
      const res = await fetch(`/api/clinics/${clinic.id}/documents?type=${tipo}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast({
          variant: "destructive",
          title: "Erro ao remover documento",
          description: err.error ?? "Erro desconhecido",
        });
        return;
      }
      toast({ title: `${meta.title} removida com sucesso` });
      onChanged();
    } catch {
      toast({ variant: "destructive", title: "Erro de conexão ao remover documento" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-[#0B1F33]">
            <Icon className="h-5 w-5 text-[#0F5F8F]" />
            {meta.title}
          </CardTitle>
          {latestDoc && (
            <Badge variant="outline" className="shrink-0">
              v{latestDoc.versao}
            </Badge>
          )}
        </div>
        <CardDescription>{meta.desc}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {showDrift && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              As condições comerciais foram alteradas após a geração deste
              documento. Gere uma nova versão para refletir os valores atuais.
            </span>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
        />

        {url ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className="gap-1 border-green-300 text-green-700"
            >
              <CheckCircle2 className="h-3 w-3" /> {meta.uploaded}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="h-7 px-2 text-xs"
              onClick={() => openDocument(url)}
            >
              <ExternalLink className="mr-1 h-3 w-3" /> Ver
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              className="h-7 px-2 text-xs"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <Upload className="mr-1 h-3 w-3" /> Substituir
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              disabled={deleting}
              onClick={() => setConfirmDelete(true)}
              data-testid={`btn-delete-${tipo}`}
            >
              {deleting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            type="button"
            className="w-fit"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            data-testid={`btn-upload-${tipo}`}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Enviar {meta.title} (PDF)
          </Button>
        )}

        <div className="mt-auto space-y-2 border-t pt-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled
              title="Disponível nas próximas etapas"
            >
              <Sparkles className="mr-2 h-4 w-4" /> {meta.gerar}
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled
              title="Disponível nas próximas etapas"
            >
              <Send className="mr-2 h-4 w-4" /> {meta.enviar}
            </Button>
          </div>
          <p className="text-xs text-[#4A5568]">
            Geração automática e assinatura eletrônica chegam nas próximas etapas.
          </p>
        </div>
      </CardContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {meta.title}</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o arquivo de {meta.title}? Esta ação
              não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmDelete(false);
                handleDelete();
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
