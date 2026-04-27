import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Shield,
  CheckCircle2,
  Clock,
  Send,
  Upload,
  FileSignature,
  Download,
  FileDown,
  RefreshCw,
  Eye,
  ExternalLink,
  Mail,
} from "lucide-react";
import {
  useLgpdTermos,
  useRequestLgpdSigning,
  useResendLgpdSigningEmail,
  useUploadLgpdPdf,
  downloadSignedPdf,
  downloadFilledPdf,
  type LgpdTermoData,
} from "@/hooks/use-kickoff-api";

const TOTAL_TERMS = 6;

interface Props { clinicId: string }

function statusChip(status: string) {
  switch (status) {
    case "assinado":
      return (
        <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">
          <CheckCircle2 className="h-3 w-3 mr-1" />Assinado
        </Badge>
      );
    case "enviado":
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs">
          <Send className="h-3 w-3 mr-1" />Aguardando assinatura
        </Badge>
      );
    case "anexado":
      return (
        <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-xs">
          <FileSignature className="h-3 w-3 mr-1" />PDF anexado
        </Badge>
      );
    case "recusado":
      return <Badge variant="destructive" className="text-xs">Recusado</Badge>;
    default:
      return (
        <Badge variant="outline" className="text-xs">
          <Clock className="h-3 w-3 mr-1" />Pendente
        </Badge>
      );
  }
}

export default function LgpdTab({ clinicId }: Props) {
  const { toast } = useToast();
  const { data: termos = [], isLoading } = useLgpdTermos(clinicId);
  const requestSigning = useRequestLgpdSigning(clinicId);
  const resendEmail = useResendLgpdSigningEmail(clinicId);
  const uploadPdf = useUploadLgpdPdf(clinicId);

  const [selectedTermo, setSelectedTermo] = useState<LgpdTermoData | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerCargo, setSignerCargo] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [lastResult, setLastResult] = useState<{
    termoId: string; signatureLink: string; emailSent: boolean; emailError: string | null;
  } | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const formalized = termos.filter((t) => ["assinado", "anexado"].includes(t.status)).length;

  function openDialog(termo: LgpdTermoData) {
    setSelectedTermo(termo);
    setSignerName(termo.signatarioNome ?? "");
    setSignerEmail(termo.signatarioEmail ?? "");
    setSignerCargo(termo.signatarioCargo ?? "");
    setLastResult(null);
    setDialogOpen(true);
  }

  function confirm() {
    if (!selectedTermo || !signerEmail || !signerName) return;
    requestSigning.mutate(
      {
        termoId: selectedTermo.id,
        signerName: signerName.trim(),
        signerEmail: signerEmail.trim(),
        signerCargo: signerCargo.trim() || null,
      },
      {
        onSuccess: (res) => {
          setLastResult({
            termoId: selectedTermo.id,
            signatureLink: res.signatureLink,
            emailSent: res.emailSent,
            emailError: res.emailError,
          });
          if (res.emailSent) {
            toast({
              title: "Solicitação enviada",
              description: `E-mail entregue para ${signerEmail.trim()}.`,
            });
          } else {
            toast({
              variant: "destructive",
              title: "Termo gerado, mas e-mail falhou",
              description: res.emailError ?? "Use o link manual abaixo para enviar ao signatário.",
            });
          }
        },
        onError: (e) =>
          toast({ variant: "destructive", title: "Erro", description: (e as Error).message }),
      },
    );
  }

  function handleResend(termo: LgpdTermoData) {
    resendEmail.mutate(
      { termoId: termo.id },
      {
        onSuccess: (res) => {
          if (res.success) {
            toast({ title: "E-mail reenviado" });
          } else {
            toast({
              variant: "destructive",
              title: "Falha ao reenviar",
              description: res.emailError ?? "—",
            });
          }
        },
        onError: (e) =>
          toast({ variant: "destructive", title: "Erro", description: (e as Error).message }),
      },
    );
  }

  async function handleDownloadSigned(termo: LgpdTermoData) {
    try {
      await downloadSignedPdf(clinicId, termo.id, `${termo.slug}-assinado.pdf`);
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao baixar PDF", description: (e as Error).message });
    }
  }

  async function handleDownloadFilled(termo: LgpdTermoData) {
    try {
      await downloadFilledPdf(clinicId, termo.id, `${termo.slug}-preenchido.pdf`);
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao baixar PDF", description: (e as Error).message });
    }
  }

  function handlePdfUpload(termo: LgpdTermoData, file: File) {
    uploadPdf.mutate(
      { termoId: termo.id, file },
      {
        onSuccess: () => toast({ title: "PDF anexado com sucesso" }),
        onError: (e) =>
          toast({ variant: "destructive", title: "Erro no upload", description: (e as Error).message }),
      },
    );
  }

  if (isLoading)
    return (
      <div className="p-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
      </div>
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Shield className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{formalized} de {TOTAL_TERMS} termos formalizados</p>
              <p className="text-sm text-muted-foreground">
                Documentos LGPD e autorizações obrigatórios da clínica
              </p>
            </div>
          </div>
          <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(formalized / TOTAL_TERMS) * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            <strong className="text-foreground">Assinatura eletrônica simples</strong> com validade
            jurídica (Lei nº 14.063/2020). O signatário recebe um e-mail com link único para
            revisar o documento e assinar — registramos nome, CPF, IP, data/hora e hash do
            documento como evidência.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4">
        {termos.map((termo) => {
          const isSent = termo.status === "enviado";
          const isSigned = termo.status === "assinado";
          const isAttached = termo.status === "anexado";
          const isPendingOrRefused = ["pendente", "recusado"].includes(termo.status);

          return (
            <Card key={termo.id} data-testid={`card-termo-${termo.slug}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base">{termo.nome}</CardTitle>
                    <CardDescription className="mt-1">{termo.descricao}</CardDescription>
                  </div>
                  {statusChip(termo.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {termo.signatarioNome && (
                      <p>
                        <strong className="text-foreground">Signatário:</strong> {termo.signatarioNome}
                        {" — "}
                        <span className="text-muted-foreground">{termo.signatarioEmail}</span>
                        {termo.signatarioCargo && <span> · {termo.signatarioCargo}</span>}
                      </p>
                    )}
                    {termo.signerCpf && isSigned && (
                      <p>
                        <strong className="text-foreground">CPF do signatário:</strong>{" "}
                        <span className="font-mono">{termo.signerCpf}</span>
                      </p>
                    )}
                    {termo.enviadoEm && (
                      <p>Enviado: {new Date(termo.enviadoEm).toLocaleString("pt-BR")}</p>
                    )}
                    {termo.assinadoEm && (
                      <p className="text-emerald-700">
                        Assinado em: {new Date(termo.assinadoEm).toLocaleString("pt-BR")}
                      </p>
                    )}
                    {isSent && termo.signingTokenExpiresAt && (
                      <p className="text-amber-700">
                        Link expira em: {new Date(termo.signingTokenExpiresAt).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadFilled(termo)}
                      data-testid={`btn-download-filled-${termo.slug}`}
                    >
                      <FileDown className="h-3.5 w-3.5 mr-1" />
                      Baixar PDF preenchido
                    </Button>
                    {isSigned && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleDownloadSigned(termo)}
                        data-testid={`btn-download-${termo.slug}`}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        Baixar PDF assinado
                      </Button>
                    )}
                    {isAttached && termo.storagePath && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleDownloadSigned(termo)}
                        data-testid={`btn-download-attached-${termo.slug}`}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        Baixar PDF
                      </Button>
                    )}
                    {isSent && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResend(termo)}
                        disabled={resendEmail.isPending}
                        data-testid={`btn-resend-${termo.slug}`}
                      >
                        {resendEmail.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5 mr-1" />
                        )}
                        Reenviar e-mail
                      </Button>
                    )}
                    {(isPendingOrRefused || isSent) && (
                      <Button
                        size="sm"
                        variant={isPendingOrRefused ? "default" : "outline"}
                        onClick={() => openDialog(termo)}
                        data-testid={`btn-request-signing-${termo.slug}`}
                      >
                        <Send className="h-3.5 w-3.5 mr-1" />
                        {isSent ? "Reemitir solicitação" : "Solicitar assinatura"}
                      </Button>
                    )}
                    {isPendingOrRefused && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fileRefs.current[termo.id]?.click()}
                          data-testid={`btn-attach-${termo.slug}`}
                        >
                          <Upload className="h-3.5 w-3.5 mr-1" /> Anexar PDF
                        </Button>
                        <input
                          ref={(el) => { fileRefs.current[termo.id] = el; }}
                          type="file"
                          accept=".pdf,application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePdfUpload(termo, file);
                            e.target.value = "";
                          }}
                        />
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {termos.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>Carregando termos LGPD…</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar assinatura eletrônica</DialogTitle>
            <DialogDescription>
              Geramos o PDF do termo, hospedamos com link único e enviamos ao signatário por
              e-mail. Sem dependência de Autentique.
            </DialogDescription>
          </DialogHeader>
          {selectedTermo && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-md bg-muted text-sm font-medium">
                <FileSignature className="h-4 w-4 inline mr-1.5 text-primary" />
                {selectedTermo.nome}
              </div>
              <div className="space-y-2">
                <Label>Nome do signatário *</Label>
                <Input
                  data-testid="input-dialog-signer-name"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Dr. Edgar Stroppa Lamas"
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail do signatário *</Label>
                <Input
                  data-testid="input-dialog-signer-email"
                  type="email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  placeholder="edgar@clinica.com.br"
                />
              </div>
              <div className="space-y-2">
                <Label>Cargo / função (opcional)</Label>
                <Input
                  data-testid="input-dialog-signer-cargo"
                  value={signerCargo}
                  onChange={(e) => setSignerCargo(e.target.value)}
                  placeholder="Sócio-Administrador"
                />
              </div>

              {lastResult && lastResult.termoId === selectedTermo.id && (
                <Alert variant={lastResult.emailSent ? "default" : "destructive"}>
                  {lastResult.emailSent ? (
                    <Mail className="h-4 w-4" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  <AlertTitle>
                    {lastResult.emailSent ? "Solicitação enviada" : "E-mail falhou — use o link manual"}
                  </AlertTitle>
                  <AlertDescription className="space-y-1.5">
                    {!lastResult.emailSent && lastResult.emailError && (
                      <p className="text-xs">{lastResult.emailError}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <code className="text-xs flex-1 truncate bg-muted px-2 py-1 rounded font-mono">
                        {lastResult.signatureLink}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigator.clipboard.writeText(lastResult.signatureLink)}
                      >
                        Copiar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(lastResult.signatureLink, "_blank")}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Fechar
            </Button>
            <Button
              onClick={confirm}
              disabled={requestSigning.isPending || !signerName || !signerEmail}
              data-testid="btn-confirm-request-signing"
            >
              {requestSigning.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {lastResult ? "Reemitir e enviar" : "Gerar e enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
