import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { getGetClinicQueryKey } from "@workspace/api-client-react";
import { getListSociosQueryKey } from "@workspace/api-client-react";
import {
  Loader2,
  FileText,
  ExternalLink,
  Sparkles,
  Trash2,
  Upload,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  useSocietaryDocs,
  useUploadSocietaryDoc,
  useApplySocietaryExtraction,
  useDeleteSocietaryDoc,
  getSocietarySignedUrl,
  societaryTipoLabel,
  SOCIETARY_TIPOS,
  type SocietaryDoc,
} from "@/hooks/use-societary-docs";

const MAX_BYTES = 10 * 1024 * 1024;

function brl(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
}

function maskCpf(cpf: string | null | undefined): string {
  if (!cpf) return "—";
  const digits = cpf.replace(/\D+/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.***-${digits.slice(9)}`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function SocietaryDocsCard({ clinicId }: { clinicId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<string>("contrato_social");
  const [file, setFile] = useState<File | null>(null);

  const { data: docs, isLoading } = useSocietaryDocs(clinicId);
  const uploadMut = useUploadSocietaryDoc(clinicId);
  const deleteMut = useDeleteSocietaryDoc(clinicId);

  const onUpload = () => {
    if (!file) {
      toast({ variant: "destructive", title: "Selecione um arquivo" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ variant: "destructive", title: "Arquivo excede 10 MB" });
      return;
    }
    uploadMut.mutate(
      { tipo, file },
      {
        onSuccess: () => {
          toast({ title: "Documento enviado e analisado" });
          setFile(null);
          const inp = document.getElementById(
            "societary-file-input",
          ) as HTMLInputElement | null;
          if (inp) inp.value = "";
        },
        onError: (err) =>
          toast({
            variant: "destructive",
            title: "Falha no envio",
            description: (err as Error).message,
          }),
      },
    );
  };

  const openDoc = async (id: string) => {
    try {
      const url = await getSocietarySignedUrl(clinicId, id);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Falha ao abrir",
        description: (err as Error).message,
      });
    }
  };

  const onDelete = (id: string) => {
    if (!confirm("Remover esta análise? O arquivo continuará na biblioteca."))
      return;
    deleteMut.mutate(id, {
      onSuccess: () => toast({ title: "Análise removida" }),
    });
  };

  const onApplied = () => {
    qc.invalidateQueries({ queryKey: getListSociosQueryKey(clinicId) });
    qc.invalidateQueries({ queryKey: getGetClinicQueryKey(clinicId) });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Documentos Societários (com análise por IA)
        </CardTitle>
        <CardDescription>
          Envie o Contrato Social, Alterações Contratuais ou Acordo de Sócios
          (PDF até 10 MB). A IA extrai capital social, sócios, percentual e
          valor das quotas para você revisar antes de aplicar. Os arquivos
          também aparecem na <span className="font-medium">Biblioteca de
          Documentos</span> (categoria "Contratos e Aditivos").
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload form */}
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] items-end p-3 border rounded-md bg-muted/30">
          <div className="space-y-1">
            <Label htmlFor="societary-file-input">Arquivo</Label>
            <Input
              id="societary-file-input"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              data-testid="input-societary-file"
            />
          </div>
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger data-testid="select-societary-tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOCIETARY_TIPOS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={onUpload}
            disabled={uploadMut.isPending || !file}
            data-testid="btn-upload-societary"
          >
            {uploadMut.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analisando…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Enviar e analisar
              </>
            )}
          </Button>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : !docs || docs.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed rounded-md py-6 text-center">
            Nenhum documento societário enviado ainda.
          </p>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => (
              <SocietaryDocItem
                key={doc.id}
                clinicId={clinicId}
                doc={doc}
                onOpen={() => openDoc(doc.id)}
                onDelete={() => onDelete(doc.id)}
                onApplied={onApplied}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SocietaryDocItem({
  clinicId,
  doc,
  onOpen,
  onDelete,
  onApplied,
}: {
  clinicId: string;
  doc: SocietaryDoc;
  onOpen: () => void;
  onDelete: () => void;
  onApplied: () => void;
}) {
  const { toast } = useToast();
  const applyMut = useApplySocietaryExtraction(clinicId);
  const ext = doc.extraction;
  const sociosList = ext?.socios ?? [];

  const [applyCapital, setApplyCapital] = useState<boolean>(
    ext?.capital_social != null,
  );
  const [picked, setPicked] = useState<Set<number>>(
    () => new Set(sociosList.map((_, i) => i)),
  );

  const togglePick = (i: number) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const onApply = () => {
    applyMut.mutate(
      {
        id: doc.id,
        applyCapitalSocial: applyCapital,
        socioIndices: Array.from(picked),
      },
      {
        onSuccess: (r) => {
          toast({
            title: "Sugestões aplicadas",
            description: `Capital ${r.capitalUpdated ? "atualizado" : "mantido"}, sócios criados: ${r.sociosCreated}, atualizados: ${r.sociosUpdated}.`,
          });
          onApplied();
        },
        onError: (err) =>
          toast({
            variant: "destructive",
            title: "Falha ao aplicar",
            description: (err as Error).message,
          }),
      },
    );
  };

  return (
    <div className="rounded-md border p-3 space-y-3 bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm truncate">{doc.document.title}</p>
              <Badge variant="outline" className="text-xs">
                {societaryTipoLabel(doc.tipo)}
              </Badge>
              {doc.appliedAt && (
                <Badge variant="secondary" className="text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Aplicado
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {fmtDate(doc.createdAt)} •{" "}
              {doc.document.fileSize
                ? `${(doc.document.fileSize / 1024).toFixed(0)} KB`
                : "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={onOpen}
            title="Abrir"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onDelete}
            title="Remover análise"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {doc.status === "error" ? (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/30 rounded-md p-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Não foi possível analisar este documento.{" "}
            {doc.errorMessage ?? "Tente reenviar ou preencha os campos manualmente."}
          </p>
        </div>
      ) : (
        <>
          {ext?.resumo && (
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Resumo</p>
              <p className="whitespace-pre-line">{ext.resumo}</p>
            </div>
          )}
          {ext?.capital_social != null && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={applyCapital}
                onCheckedChange={(v) => setApplyCapital(v === true)}
              />
              <span>
                Aplicar capital social sugerido:{" "}
                <strong>{brl(ext.capital_social)}</strong>
              </span>
            </label>
          )}
          {sociosList.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Sócios extraídos</p>
              <div className="space-y-1">
                {sociosList.map((s, i) => (
                  <label
                    key={i}
                    className="flex items-start gap-2 text-sm rounded-md border p-2 hover:bg-accent/30 cursor-pointer"
                  >
                    <Checkbox
                      checked={picked.has(i)}
                      onCheckedChange={() => togglePick(i)}
                      className="mt-0.5"
                    />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 flex-1 text-xs">
                      <div className="sm:col-span-2 font-medium text-sm text-foreground">
                        {s.nome}
                      </div>
                      <div>
                        <span className="text-muted-foreground">CPF: </span>
                        {maskCpf(s.cpf)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Quotas: </span>
                        {s.percentual != null ? `${s.percentual}%` : "—"}
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground">Valor: </span>
                        {brl(s.valor_quotas)}
                      </div>
                      {s.qualificacao && (
                        <div className="sm:col-span-2 text-muted-foreground">
                          {s.qualificacao}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
          {(ext?.capital_social != null || sociosList.length > 0) && (
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={onApply}
                disabled={
                  applyMut.isPending ||
                  (!applyCapital && picked.size === 0)
                }
                data-testid={`btn-apply-${doc.id}`}
              >
                {applyMut.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Aplicar selecionados
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
