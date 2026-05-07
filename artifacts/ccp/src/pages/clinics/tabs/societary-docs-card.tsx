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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  RefreshCw,
  Eye,
  Pencil,
  Check,
  X,
  History,
  ChevronDown,
  ChevronRight,
  Users,
} from "lucide-react";
import {
  useSocietaryDocs,
  useUploadSocietaryDoc,
  useApplySocietaryExtraction,
  useDeleteSocietaryDoc,
  useReanalyzeSocietaryDoc,
  useRenameSocietaryDoc,
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

function fmtDateBR(iso: string): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (m) {
    const [, y, mo, d] = m;
    return d ? `${d}/${mo}/${y}` : `${mo}/${y}`;
  }
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

function fmtShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}

function isPending(doc: SocietaryDoc): boolean {
  return doc.status === "error" || (doc.status === "ready" && !doc.appliedAt);
}

export default function SocietaryDocsCard({ clinicId }: { clinicId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<string>("contrato_social");
  const [file, setFile] = useState<File | null>(null);
  const [historicoOpen, setHistoricoOpen] = useState(false);

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

  const list = docs ?? [];
  const pendentes = list.filter(isPending);
  const historico = list.filter((d) => !isPending(d));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Documentos Societários (com análise por IA)
        </CardTitle>
        <CardDescription>
          Envie o Contrato Social, Alterações Contratuais ou Acordo de Sócios
          (PDF até 10 MB). PDFs com texto e PDFs{" "}
          <span className="font-medium">escaneados</span> são suportados —
          quando o PDF é só imagem, as páginas são enviadas para a IA via
          análise visual. A extração identifica capital social, sócios,
          percentual e valor das quotas, e o documento é arquivado com um título
          profissional na{" "}
          <span className="font-medium">Biblioteca de Documentos</span>{" "}
          (categoria "Contratos e Aditivos").
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

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed rounded-md py-6 text-center">
            Nenhum documento societário enviado ainda.
          </p>
        ) : (
          <>
            {/* Pendentes em destaque */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-amber-500" />
                  <h3 className="text-sm font-semibold tracking-tight">
                    Pendentes de revisão
                  </h3>
                  <Badge variant="secondary" className="text-xs">
                    {pendentes.length}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Documentos que precisam da sua atenção
                </p>
              </div>

              {pendentes.length === 0 ? (
                <p className="text-sm text-muted-foreground border border-dashed rounded-md py-6 text-center">
                  Nenhum documento pendente. 🎉
                </p>
              ) : (
                <div className="space-y-3">
                  {pendentes.map((doc) => (
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
            </div>

            {/* Histórico colapsado */}
            {historico.length > 0 && (
              <Collapsible
                open={historicoOpen}
                onOpenChange={setHistoricoOpen}
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors"
                    data-testid="btn-toggle-historico-societario"
                  >
                    <div className="flex items-center gap-2">
                      {historicoOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <History className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        Histórico de documentos importados
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {historico.length}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {historicoOpen ? "Ocultar" : "Ver"}
                    </span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <div className="rounded-md border overflow-hidden">
                    <div className="divide-y">
                      {historico.map((doc) => (
                        <HistoryRow
                          key={doc.id}
                          clinicId={clinicId}
                          doc={doc}
                          onOpen={() => openDoc(doc.id)}
                          onDelete={() => onDelete(doc.id)}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 px-1">
                    Os arquivos continuam disponíveis na{" "}
                    <span className="font-medium">
                      Biblioteca de Documentos
                    </span>{" "}
                    mesmo após a remoção da análise.
                  </p>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
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
  const reanalyzeMut = useReanalyzeSocietaryDoc(clinicId);
  const renameMut = useRenameSocietaryDoc(clinicId);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(doc.document.title);

  const startEdit = () => {
    setTitleDraft(doc.document.title);
    setEditingTitle(true);
  };
  const cancelEdit = () => {
    setEditingTitle(false);
    setTitleDraft(doc.document.title);
  };
  const saveEdit = () => {
    const trimmed = titleDraft.trim();
    if (trimmed.length === 0) {
      toast({ variant: "destructive", title: "O título não pode ficar vazio." });
      return;
    }
    if (trimmed === doc.document.title) {
      setEditingTitle(false);
      return;
    }
    renameMut.mutate(
      { id: doc.id, title: trimmed },
      {
        onSuccess: () => {
          toast({ title: "Título atualizado" });
          setEditingTitle(false);
        },
        onError: (err) =>
          toast({
            variant: "destructive",
            title: "Falha ao renomear",
            description: (err as Error).message,
          }),
      },
    );
  };

  const ext = doc.extraction;
  const sociosList = ext?.socios ?? [];
  const showReanalyze =
    doc.status === "error" ||
    (doc.status === "ready" && sociosList.length === 0);

  const onReanalyze = () => {
    reanalyzeMut.mutate(doc.id, {
      onSuccess: (r) =>
        toast({
          title: "Documento re-analisado",
          description:
            r.status === "ready"
              ? "A IA conseguiu extrair as informações desta vez."
              : (r.errorMessage ?? "A análise ainda não foi possível."),
          variant: r.status === "ready" ? "default" : "destructive",
        }),
      onError: (err) =>
        toast({
          variant: "destructive",
          title: "Falha ao re-analisar",
          description: (err as Error).message,
        }),
    });
  };

  const [applyCapital, setApplyCapital] = useState<boolean>(
    ext?.capital_social != null,
  );
  const [picked, setPicked] = useState<Set<number>>(
    () => new Set(sociosList.map((_, i) => i)),
  );
  const canMarkExited =
    typeof ext?.data_referencia === "string" &&
    ext.data_referencia.trim().length > 0 &&
    sociosList.length > 0;
  const [markExited, setMarkExited] = useState<boolean>(canMarkExited);

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
        markOmittedAsExited: canMarkExited && markExited,
      },
      {
        onSuccess: (r) => {
          const parts = [
            `Capital ${r.capitalUpdated ? "atualizado" : "mantido"}`,
            `sócios criados: ${r.sociosCreated}`,
            `atualizados: ${r.sociosUpdated}`,
          ];
          if (r.sociosExited > 0) {
            parts.push(`marcados como retirados: ${r.sociosExited}`);
          }
          toast({
            title: "Sugestões aplicadas",
            description: parts.join(", ") + ".",
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
    <div className="rounded-md border-2 border-amber-200 dark:border-amber-900/40 p-3 space-y-3 bg-amber-50/30 dark:bg-amber-950/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {editingTitle ? (
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <Input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveEdit();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelEdit();
                      }
                    }}
                    autoFocus
                    disabled={renameMut.isPending}
                    maxLength={500}
                    className="h-8 text-sm"
                    data-testid={`input-rename-${doc.id}`}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={saveEdit}
                    disabled={renameMut.isPending}
                    title="Salvar"
                    data-testid={`btn-save-rename-${doc.id}`}
                  >
                    {renameMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={cancelEdit}
                    disabled={renameMut.isPending}
                    title="Cancelar"
                    data-testid={`btn-cancel-rename-${doc.id}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <p className="font-medium text-sm truncate">
                    {doc.document.title}
                  </p>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    onClick={startEdit}
                    title="Editar título"
                    data-testid={`btn-edit-title-${doc.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              <Badge variant="outline" className="text-xs">
                {societaryTipoLabel(doc.tipo)}
              </Badge>
              {doc.appliedAt && (
                <Badge variant="secondary" className="text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Aplicado
                </Badge>
              )}
              {doc.analysisMode === "vision" && (
                <Badge variant="outline" className="text-xs">
                  <Eye className="h-3 w-3 mr-1" />
                  PDF escaneado (visão)
                </Badge>
              )}
              {doc.truncated && (
                <Badge variant="outline" className="text-xs">
                  Análise parcial
                  {doc.pagesAnalyzed && doc.totalPages
                    ? ` (${doc.pagesAnalyzed}/${doc.totalPages} pp.)`
                    : ""}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {fmtDate(doc.createdAt)} •{" "}
              {doc.document.fileSize
                ? `${(doc.document.fileSize / 1024).toFixed(0)} KB`
                : "—"}{" "}
              • <span className="font-mono">{doc.document.fileName}</span>
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

      {doc.status === "error" && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/30 rounded-md p-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Não foi possível analisar este documento.{" "}
            {doc.errorMessage ??
              "Tente re-analisar ou preencha os campos manualmente."}
          </p>
        </div>
      )}
      {doc.status === "ready" && sociosList.length === 0 && (
        <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/40 border rounded-md p-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Análise concluída sem sócios identificados. Use “Re-analisar” se o
            documento contém sócios — uma nova passagem (incluindo análise
            visual para PDFs escaneados) pode resolver.
          </p>
        </div>
      )}
      {showReanalyze && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={onReanalyze}
            disabled={reanalyzeMut.isPending}
            data-testid={`btn-reanalyze-${doc.id}`}
          >
            {reanalyzeMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Re-analisar
          </Button>
        </div>
      )}
      {doc.status === "ready" && (
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
                    className="flex items-start gap-2 text-sm rounded-md border p-2 hover:bg-accent/30 cursor-pointer bg-card"
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
          {canMarkExited && (
            <label className="flex items-start gap-2 text-sm rounded-md border border-amber-300 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 p-2">
              <Checkbox
                checked={markExited}
                onCheckedChange={(v) => setMarkExited(v === true)}
                className="mt-0.5"
              />
              <span className="leading-snug">
                Marcar sócios atuais <strong>omitidos</strong> neste documento
                como <strong>retirados em {fmtDateBR(ext!.data_referencia!)}</strong>.
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Use quando este documento (alteração ou contrato consolidado)
                  representa o quadro societário completo após a mudança.
                </span>
              </span>
            </label>
          )}
          {(ext?.capital_social != null || sociosList.length > 0) && (
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={onApply}
                disabled={
                  applyMut.isPending ||
                  (!applyCapital && picked.size === 0 && !(canMarkExited && markExited))
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

function HistoryRow({
  clinicId,
  doc,
  onOpen,
  onDelete,
}: {
  clinicId: string;
  doc: SocietaryDoc;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const reanalyzeMut = useReanalyzeSocietaryDoc(clinicId);
  const renameMut = useRenameSocietaryDoc(clinicId);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(doc.document.title);

  const startEdit = () => {
    setTitleDraft(doc.document.title);
    setEditingTitle(true);
  };
  const cancelEdit = () => {
    setEditingTitle(false);
    setTitleDraft(doc.document.title);
  };
  const saveEdit = () => {
    const trimmed = titleDraft.trim();
    if (trimmed.length === 0) {
      toast({ variant: "destructive", title: "O título não pode ficar vazio." });
      return;
    }
    if (trimmed === doc.document.title) {
      setEditingTitle(false);
      return;
    }
    renameMut.mutate(
      { id: doc.id, title: trimmed },
      {
        onSuccess: () => {
          toast({ title: "Título atualizado" });
          setEditingTitle(false);
        },
        onError: (err) =>
          toast({
            variant: "destructive",
            title: "Falha ao renomear",
            description: (err as Error).message,
          }),
      },
    );
  };

  const onReanalyze = () => {
    reanalyzeMut.mutate(doc.id, {
      onSuccess: (r) =>
        toast({
          title: "Documento re-analisado",
          description:
            r.status === "ready"
              ? "A IA conseguiu extrair as informações desta vez."
              : (r.errorMessage ?? "A análise ainda não foi possível."),
          variant: r.status === "ready" ? "default" : "destructive",
        }),
      onError: (err) =>
        toast({
          variant: "destructive",
          title: "Falha ao re-analisar",
          description: (err as Error).message,
        }),
    });
  };

  const sociosCount = doc.extraction?.socios?.length ?? 0;
  const dateIso = doc.appliedAt ?? doc.createdAt;

  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/40 transition-colors">
      <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums w-20">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500 shrink-0" />
        {fmtShortDate(dateIso)}
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {editingTitle ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <Input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveEdit();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEdit();
                  }
                }}
                autoFocus
                disabled={renameMut.isPending}
                maxLength={500}
                className="h-7 text-sm"
                data-testid={`input-rename-history-${doc.id}`}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={saveEdit}
                disabled={renameMut.isPending}
                title="Salvar"
              >
                {renameMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={cancelEdit}
                disabled={renameMut.isPending}
                title="Cancelar"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <p className="font-medium truncate">{doc.document.title}</p>
          )}
          <Badge variant="outline" className="text-[10px] py-0 h-4">
            {societaryTipoLabel(doc.tipo)}
          </Badge>
          {doc.analysisMode === "vision" && (
            <Badge
              variant="outline"
              className="text-[10px] py-0 h-4"
              title="PDF escaneado (análise visual)"
            >
              <Eye className="h-2.5 w-2.5 mr-0.5" />
              visão
            </Badge>
          )}
          {doc.truncated && (
            <Badge
              variant="outline"
              className="text-[10px] py-0 h-4"
              title={
                doc.pagesAnalyzed && doc.totalPages
                  ? `Análise parcial: ${doc.pagesAnalyzed}/${doc.totalPages} páginas`
                  : "Análise parcial"
              }
            >
              parcial
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {sociosCount > 0 ? (
            <>
              <Users className="inline h-3 w-3 mr-1 -mt-0.5" />
              {sociosCount} sócio{sociosCount > 1 ? "s" : ""} extraído
              {sociosCount > 1 ? "s" : ""}
              {" · "}
            </>
          ) : null}
          <span className="font-mono">{doc.document.fileName}</span>
        </p>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={onOpen}
          title="Abrir"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={onReanalyze}
          disabled={reanalyzeMut.isPending}
          title="Re-analisar"
          data-testid={`btn-reanalyze-history-${doc.id}`}
        >
          {reanalyzeMut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={startEdit}
          title="Editar título"
          data-testid={`btn-edit-title-history-${doc.id}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={onDelete}
          title="Remover análise"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
