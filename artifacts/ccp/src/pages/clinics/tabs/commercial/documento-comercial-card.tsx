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
  History,
  Eye,
  Plus,
  X,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clinicToSnapshot, conditionsDiffer, formatCurrency } from "./shared";

type Tipo = "proposta" | "contrato";

type Papel = "contratante" | "contratada" | "testemunha";

interface SignatarioForm {
  nome: string;
  email: string;
  cargo: string;
  papel: Papel;
}

const PAPEL_LABEL: Record<Papel, string> = {
  contratante: "Contratante (cliente)",
  contratada: "Contratada (CLINIONEX360)",
  testemunha: "Testemunha",
};

function emptySignatario(papel: Papel = "contratante"): SignatarioForm {
  return { nome: "", email: "", cargo: "", papel };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

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

function fmtCurrency(v: number | null | undefined): string {
  return v == null ? "—" : formatCurrency(v);
}

function fmtText(v: string | null | undefined): string {
  return v && v.trim() !== "" ? v : "—";
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const [y, m, d] = v.split("T")[0].split("-");
  return y && m && d ? `${d}/${m}/${y}` : v;
}

export function DocumentoComercialCard({
  clinic,
  tipo,
  versions,
  latestDoc,
  onChanged,
}: {
  clinic: Clinic;
  tipo: Tipo;
  versions: DocumentoComercial[];
  latestDoc?: DocumentoComercial;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [propostaSigner, setPropostaSigner] = useState<SignatarioForm>(
    emptySignatario("contratante"),
  );
  const [contratoSigners, setContratoSigners] = useState<SignatarioForm[]>([
    emptySignatario("contratante"),
  ]);

  const meta = META[tipo];
  const Icon = meta.icon;
  const url = tipo === "proposta" ? clinic.propostaUrl : clinic.contratoUrl;

  // "Enviar para assinatura" is available once a PDF version exists and the
  // document has not already been (fully) signed.
  const canSend =
    !!latestDoc?.pdfPath &&
    latestDoc.status !== "assinado" &&
    latestDoc.status !== "assinando";

  const openSendModal = () => {
    if (tipo === "proposta") {
      setPropostaSigner({
        nome: clinic.responsavel ?? "",
        email: "",
        cargo: "",
        papel: "contratante",
      });
    } else {
      setContratoSigners([
        {
          nome: clinic.responsavel ?? "",
          email: "",
          cargo: "",
          papel: "contratante",
        },
        emptySignatario("contratada"),
      ]);
    }
    setSendOpen(true);
  };

  const showDrift =
    !!latestDoc?.snapshot &&
    conditionsDiffer(clinicToSnapshot(clinic), latestDoc.snapshot);

  const statusLabel = latestDoc?.status ?? "Não gerado";

  const conferenceRows: { label: string; value: string }[] = [
    { label: "Cliente", value: fmtText(clinic.nome) },
    { label: "CNPJ", value: fmtText(clinic.cnpj) },
    { label: "Implantação", value: fmtCurrency(clinic.valorImplantacao) },
    { label: "Recorrência (MRR)", value: fmtCurrency(clinic.valorRecorrente) },
    { label: "Forma de pagamento", value: fmtText(clinic.formaPagamento) },
    ...(tipo === "contrato"
      ? [
          {
            label: "Prazo do contrato",
            value:
              clinic.prazoContratoMeses != null
                ? `${clinic.prazoContratoMeses} meses`
                : "—",
          },
          {
            label: "Dia de vencimento",
            value:
              clinic.diaVencimento != null ? String(clinic.diaVencimento) : "—",
          },
          { label: "Índice de reajuste", value: fmtText(clinic.reajusteIndice) },
          {
            label: "Início previsto",
            value: fmtDate(clinic.inicioRecorrencia ?? clinic.dataPrevistaInicio),
          },
        ]
      : [
          {
            label: "Validade da proposta",
            value:
              clinic.validadePropostaDias != null
                ? `${clinic.validadePropostaDias} dias`
                : "—",
          },
          {
            label: "Responsável comercial",
            value: fmtText(clinic.responsavelComercial),
          },
        ]),
  ];

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

  const openVersion = (v: DocumentoComercial) => {
    if (!v.pdfPath) return;
    const serving = v.pdfPath.startsWith("/objects/")
      ? `/api/storage/objects/${v.pdfPath.replace(/^\/objects\//, "")}`
      : v.pdfPath;
    openDocument(serving);
  };

  const handleGerar = async () => {
    setGenerating(true);
    try {
      const token = getStoredToken();
      const res = await fetch(
        `/api/clinics/${clinic.id}/documentos-comerciais/${tipo}/gerar`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          variant: "destructive",
          title: `Erro ao gerar ${meta.title.toLowerCase()}`,
          description: err.error ?? "Erro desconhecido",
        });
        return;
      }
      const doc = (await res.json()) as DocumentoComercial;
      toast({
        title: `${meta.title} gerada`,
        description: `Versão v${doc.versao} gerada com sucesso.`,
      });
      onChanged();
    } catch {
      toast({
        variant: "destructive",
        title: "Erro de conexão ao gerar documento",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const token = getStoredToken();
      const res = await fetch(
        `/api/clinics/${clinic.id}/documentos-comerciais/${tipo}/preview`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          variant: "destructive",
          title: "Não foi possível gerar a prévia",
          description: err.error ?? "Erro desconhecido",
        });
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      toast({ variant: "destructive", title: "Erro ao gerar a prévia" });
    } finally {
      setPreviewing(false);
    }
  };

  const updateContratoSigner = (
    idx: number,
    patch: Partial<SignatarioForm>,
  ) => {
    setContratoSigners((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  };

  const handleEnviar = async () => {
    if (!latestDoc) return;

    let body: Record<string, unknown>;
    if (tipo === "proposta") {
      const s = propostaSigner;
      if (s.nome.trim().length < 2 || !isValidEmail(s.email)) {
        toast({
          variant: "destructive",
          title: "Preencha o nome e um e-mail válido do signatário.",
        });
        return;
      }
      body = {
        signatario: {
          nome: s.nome.trim(),
          email: s.email.trim(),
          cargo: s.cargo.trim() || null,
          papel: s.papel,
        },
      };
    } else {
      const cleaned = contratoSigners
        .map((s) => ({ ...s, nome: s.nome.trim(), email: s.email.trim() }))
        .filter((s) => s.nome !== "" || s.email !== "");
      if (cleaned.length === 0) {
        toast({
          variant: "destructive",
          title: "Adicione ao menos um signatário do contrato.",
        });
        return;
      }
      for (const s of cleaned) {
        if (s.nome.length < 2 || !isValidEmail(s.email)) {
          toast({
            variant: "destructive",
            title: "Cada signatário precisa de nome e e-mail válido.",
          });
          return;
        }
      }
      const emails = cleaned.map((s) => s.email.toLowerCase());
      if (new Set(emails).size !== emails.length) {
        toast({
          variant: "destructive",
          title: "Há e-mails duplicados entre os signatários.",
        });
        return;
      }
      body = {
        signatarios: cleaned.map((s, i) => ({
          nome: s.nome,
          email: s.email,
          cargo: s.cargo.trim() || null,
          papel: s.papel,
          ordem: i,
        })),
      };
    }

    setSending(true);
    try {
      const token = getStoredToken();
      const res = await fetch(
        `/api/clinics/${clinic.id}/documentos-comerciais/${latestDoc.id}/enviar-assinatura`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          variant: "destructive",
          title: "Não foi possível enviar para assinatura",
          description: err.error ?? "Erro desconhecido",
        });
        return;
      }
      toast({
        title: `${meta.title} enviada para assinatura`,
        description:
          tipo === "proposta"
            ? "O signatário receberá o link por e-mail."
            : "Cada signatário receberá seu próprio link por e-mail.",
      });
      setSendOpen(false);
      onChanged();
    } catch {
      toast({
        variant: "destructive",
        title: "Erro de conexão ao enviar para assinatura",
      });
    } finally {
      setSending(false);
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
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#4A5568]">
            Status
          </span>
          <Badge
            variant={latestDoc ? "secondary" : "outline"}
            className="capitalize"
            data-testid={`status-${tipo}`}
          >
            {statusLabel}
          </Badge>
        </div>

        {showDrift && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              As condições comerciais foram alteradas após a geração deste
              documento. Gere uma nova versão para refletir os valores atuais.
            </span>
          </div>
        )}

        <div className="rounded-md border border-[#0F5F8F]/15 bg-[#F4F7FA] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#0F5F8F]">
            Dados da clínica para conferência
          </p>
          <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {conferenceRows.map((row) => (
              <div
                key={row.label}
                className="flex justify-between gap-2 text-sm"
              >
                <dt className="text-[#4A5568]">{row.label}</dt>
                <dd className="text-right font-medium text-[#0B1F33]">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[#4A5568]">
            <History className="h-3.5 w-3.5" /> Histórico de versões
          </p>
          {versions.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Nenhuma versão gerada ainda.
            </p>
          ) : (
            <ul className="mt-2 space-y-1" data-testid={`historico-${tipo}`}>
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-2 rounded border bg-white px-2 py-1 text-sm"
                >
                  <span className="font-medium text-[#0B1F33]">v{v.versao}</span>
                  <Badge variant="outline" className="capitalize">
                    {v.status}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {fmtDate(v.geradoEm)}
                  </span>
                  {v.pdfPath && (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      className="h-6 px-2 text-xs"
                      onClick={() => openVersion(v)}
                      title={
                        v.geradoPorNome
                          ? `Gerado por ${v.geradoPorNome}`
                          : "Abrir versão"
                      }
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

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
              size="sm"
              type="button"
              className="bg-[#0F5F8F] text-white hover:bg-[#0B1F33]"
              disabled={generating || previewing}
              onClick={handleGerar}
              data-testid={`btn-gerar-${tipo}`}
            >
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {latestDoc ? "Gerar nova versão" : meta.gerar}
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={generating || previewing}
              onClick={handlePreview}
              data-testid={`btn-preview-${tipo}`}
            >
              {previewing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              Pré-visualizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={!canSend || sending}
              onClick={openSendModal}
              title={
                canSend
                  ? undefined
                  : latestDoc?.status === "assinado" ||
                      latestDoc?.status === "assinando"
                    ? "Documento já enviado/assinado"
                    : "Gere o documento antes de enviar"
              }
              data-testid={`btn-enviar-${tipo}`}
            >
              <Send className="mr-2 h-4 w-4" /> {meta.enviar}
            </Button>
          </div>
          <p className="text-xs text-[#4A5568]">
            Gere uma versão do PDF a partir das condições comerciais atuais ou
            pré-visualize sem salvar. Depois, envie para{" "}
            <strong>assinatura eletrônica</strong> — o signatário recebe um link
            por e-mail e o PDF assinado volta com o comprovante (Lei
            14.063/2020).
          </p>
        </div>
      </CardContent>

      <Dialog open={sendOpen} onOpenChange={(o) => !sending && setSendOpen(o)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{meta.enviar}</DialogTitle>
            <DialogDescription>
              {tipo === "proposta"
                ? "Informe o signatário que receberá o link de assinatura eletrônica por e-mail."
                : "Informe todos os signatários. Cada um recebe seu próprio link e o contrato só é concluído quando todos assinarem."}
            </DialogDescription>
          </DialogHeader>

          {tipo === "proposta" ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="proposta-nome">Nome do signatário</Label>
                <Input
                  id="proposta-nome"
                  value={propostaSigner.nome}
                  onChange={(e) =>
                    setPropostaSigner((p) => ({ ...p, nome: e.target.value }))
                  }
                  placeholder="Nome completo"
                  data-testid="input-proposta-signer-nome"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proposta-email">E-mail</Label>
                <Input
                  id="proposta-email"
                  type="email"
                  value={propostaSigner.email}
                  onChange={(e) =>
                    setPropostaSigner((p) => ({ ...p, email: e.target.value }))
                  }
                  placeholder="email@exemplo.com"
                  data-testid="input-proposta-signer-email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proposta-cargo">Cargo (opcional)</Label>
                <Input
                  id="proposta-cargo"
                  value={propostaSigner.cargo}
                  onChange={(e) =>
                    setPropostaSigner((p) => ({ ...p, cargo: e.target.value }))
                  }
                  placeholder="Ex.: Diretor"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {contratoSigners.map((s, idx) => (
                <div
                  key={idx}
                  className="space-y-3 rounded-md border border-[#0F5F8F]/15 bg-[#F4F7FA] p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#0F5F8F]">
                      Signatário {idx + 1}
                    </span>
                    {contratoSigners.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() =>
                          setContratoSigners((prev) =>
                            prev.filter((_, i) => i !== idx),
                          )
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`contrato-nome-${idx}`}>Nome</Label>
                      <Input
                        id={`contrato-nome-${idx}`}
                        value={s.nome}
                        onChange={(e) =>
                          updateContratoSigner(idx, { nome: e.target.value })
                        }
                        placeholder="Nome completo"
                        data-testid={`input-contrato-signer-nome-${idx}`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`contrato-email-${idx}`}>E-mail</Label>
                      <Input
                        id={`contrato-email-${idx}`}
                        type="email"
                        value={s.email}
                        onChange={(e) =>
                          updateContratoSigner(idx, { email: e.target.value })
                        }
                        placeholder="email@exemplo.com"
                        data-testid={`input-contrato-signer-email-${idx}`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`contrato-cargo-${idx}`}>
                        Cargo (opcional)
                      </Label>
                      <Input
                        id={`contrato-cargo-${idx}`}
                        value={s.cargo}
                        onChange={(e) =>
                          updateContratoSigner(idx, { cargo: e.target.value })
                        }
                        placeholder="Ex.: Sócio"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Papel</Label>
                      <Select
                        value={s.papel}
                        onValueChange={(v) =>
                          updateContratoSigner(idx, { papel: v as Papel })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            Object.keys(PAPEL_LABEL) as Papel[]
                          ).map((p) => (
                            <SelectItem key={p} value={p}>
                              {PAPEL_LABEL[p]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() =>
                  setContratoSigners((prev) => [...prev, emptySignatario()])
                }
                data-testid="btn-add-signatario"
              >
                <Plus className="mr-2 h-4 w-4" /> Adicionar signatário
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              disabled={sending}
              onClick={() => setSendOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-[#0F5F8F] text-white hover:bg-[#0B1F33]"
              disabled={sending}
              onClick={handleEnviar}
              data-testid={`btn-confirm-enviar-${tipo}`}
            >
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Enviar para assinatura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
