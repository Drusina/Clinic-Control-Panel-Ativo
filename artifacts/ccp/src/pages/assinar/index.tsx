import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Shield,
  FileText,
  Download,
  Lock,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface SignInfo {
  token: string;
  termoNome: string;
  termoDescricao: string | null;
  clinicNome: string;
  signatarioNome: string;
  signatarioEmail: string;
  signatarioCargo: string | null;
  status: string;
  alreadySigned: boolean;
  expiresAt: string | null;
}

async function fetchInfo(token: string): Promise<SignInfo> {
  const res = await fetch(`${BASE}/api/assinar/info/${encodeURIComponent(token)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message ?? data?.error ?? "Não foi possível carregar este documento.");
  }
  return res.json();
}

function formatCpfMask(raw: string): string {
  const cpf = raw.replace(/\D/g, "").slice(0, 11);
  const parts = [cpf.slice(0, 3), cpf.slice(3, 6), cpf.slice(6, 9), cpf.slice(9, 11)].filter(Boolean);
  if (parts.length <= 3) return parts.join(".");
  return `${parts.slice(0, 3).join(".")}-${parts[3]}`;
}

function isCpfValid(raw: string): boolean {
  const cpf = raw.replace(/\D/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (factor: number) => {
    let sum = 0;
    for (let i = 0; i < factor - 1; i++) sum += parseInt(cpf[i], 10) * (factor - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(10) === parseInt(cpf[9], 10) && calc(11) === parseInt(cpf[10], 10);
}

export default function AssinarPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";

  const { data: info, isLoading, error, refetch } = useQuery<SignInfo>({
    queryKey: ["sign-info", token],
    queryFn: () => fetchInfo(token),
    enabled: !!token,
    retry: false,
  });

  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [confirmed, setConfirmed] = useState<{
    verificationCode: string;
    signedAt: string;
    signedPdfBase64: string;
    termoNome: string;
    signatarioEmail: string;
  } | null>(null);

  // Auto-prefill name once info loads
  useEffect(() => {
    if (info?.signatarioNome) setName(info.signatarioNome);
  }, [info?.signatarioNome]);

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/assinar/submit/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signerName: name.trim(),
          signerCpf: cpf.replace(/\D/g, ""),
          acceptTerms: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Falha ao registrar assinatura");
      }
      return res.json() as Promise<{
        success: boolean; verificationCode: string; signedAt: string; signedPdfBase64: string;
      }>;
    },
    onSuccess: (data) => {
      // Snapshot the data we need for the success card BEFORE the token is
      // revoked server-side. We deliberately do NOT refetch /assinar/info
      // because the public token is now single-use-spent and would 410.
      setConfirmed({
        verificationCode: data.verificationCode,
        signedAt: data.signedAt,
        signedPdfBase64: data.signedPdfBase64,
        termoNome: info?.termoNome ?? "documento",
        signatarioEmail: info?.signatarioEmail ?? "",
      });
    },
  });

  // Builds an inline PDF data URL from the base64 returned by the submit
  // response. Used by the "Baixar documento assinado" button — no server
  // round-trip needed (the token is single-use and already spent).
  const downloadSignedPdf = (): void => {
    if (!confirmed) return;
    const a = document.createElement("a");
    a.href = `data:application/pdf;base64,${confirmed.signedPdfBase64}`;
    a.download = `${confirmed.termoNome.replace(/[^a-zA-Z0-9-_]+/g, "-").toLowerCase()}-assinado.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const pdfUrl = token ? `${BASE}/api/assinar/pdf/${encodeURIComponent(token)}` : "";

  // ─── Loading / error states ──────────────────────────────────────────────

  if (isLoading) {
    return (
      <Centered>
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Carregando documento…</p>
      </Centered>
    );
  }

  if (error || !info) {
    return (
      <Centered>
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 space-y-3 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-xl font-semibold">Link inválido ou expirado</h1>
            <p className="text-sm text-muted-foreground">
              {(error as Error | undefined)?.message ?? "Este link não é mais válido."}
            </p>
            <p className="text-xs text-muted-foreground">
              Entre em contato com a clínica para solicitar um novo link de assinatura.
            </p>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  // ─── Already signed (defense-in-depth) ───────────────────────────────────
  // Server enforces single-use semantics: /assinar/info now returns 410 once
  // the termo leaves "enviado", so this branch is normally unreachable on a
  // fresh page load. Kept defensively to handle any in-flight transition.

  if (info.alreadySigned && !confirmed) {
    return (
      <Centered>
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 space-y-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
            <h1 className="text-xl font-semibold">Documento já assinado</h1>
            <p className="text-sm text-muted-foreground">
              Este documento já foi assinado anteriormente. Verifique seu e-mail
              para o comprovante.
            </p>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  // ─── Just signed (success state) ─────────────────────────────────────────

  if (confirmed) {
    return (
      <Centered>
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 space-y-4 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-600 mx-auto" />
            <h1 className="text-2xl font-semibold">Assinatura registrada</h1>
            <p className="text-sm text-muted-foreground">
              Obrigado, <strong className="text-foreground">{name}</strong>. Sua assinatura foi
              registrada com sucesso.
            </p>
            <div className="rounded-md border bg-muted/40 p-3 text-left space-y-1.5">
              <div className="text-xs text-muted-foreground">Código de verificação</div>
              <code className="block text-sm font-mono font-semibold tracking-wider text-amber-600">
                {confirmed.verificationCode}
              </code>
              <div className="text-xs text-muted-foreground pt-1">
                Você receberá uma cópia do PDF assinado em <strong>{info.signatarioEmail}</strong>.
              </div>
            </div>
            <Button
              onClick={downloadSignedPdf}
              className="w-full"
              variant="default"
              data-testid="btn-download-just-signed"
            >
              <Download className="h-4 w-4 mr-2" />
              Baixar documento assinado
            </Button>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  // ─── Sign form ───────────────────────────────────────────────────────────

  const cpfValid = isCpfValid(cpf);
  const nameValid = name.trim().length >= 3;
  const canSubmit = cpfValid && nameValid && accepted && !submit.isPending;

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Brand header */}
      <header className="border-b bg-background">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">
              <span className="text-primary">IONEX</span>360
            </span>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              · Assinatura eletrônica
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            Conexão segura
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* PDF preview */}
        <section className="space-y-3 min-w-0">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Documento para assinatura
            </p>
            <h1 className="text-xl font-bold flex items-start gap-2">
              <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <span>{info.termoNome}</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Solicitado por <strong className="text-foreground">{info.clinicNome}</strong>
            </p>
          </div>
          <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
            <iframe
              src={pdfUrl}
              className="w-full h-[60vh] sm:h-[75vh]"
              title="Documento para assinatura"
              data-testid="iframe-document"
            />
          </div>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <Download className="h-3 w-3" /> Baixar PDF original
          </a>
        </section>

        {/* Sign form */}
        <aside className="space-y-4">
          <Card className="sticky top-4">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Confirme sua identidade</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Sua assinatura terá validade jurídica como <strong>assinatura eletrônica simples</strong>{" "}
                (Lei nº 14.063/2020). Registramos data, hora, IP, dispositivo e o conteúdo exato do
                documento.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="signer-name">Nome completo *</Label>
                <Input
                  id="signer-name"
                  data-testid="input-signer-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome como aparece no documento de identidade"
                  autoComplete="name"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="signer-cpf">CPF *</Label>
                <Input
                  id="signer-cpf"
                  data-testid="input-signer-cpf"
                  value={formatCpfMask(cpf)}
                  onChange={(e) => setCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  maxLength={14}
                />
                {cpf.length >= 11 && !cpfValid && (
                  <p className="text-xs text-destructive">CPF inválido</p>
                )}
              </div>

              <div className="text-xs text-muted-foreground space-y-1 rounded-md border bg-muted/30 p-2.5">
                <div><strong className="text-foreground">E-mail:</strong> {info.signatarioEmail}</div>
                {info.signatarioCargo && (
                  <div><strong className="text-foreground">Cargo:</strong> {info.signatarioCargo}</div>
                )}
              </div>

              <div className="flex items-start gap-2 pt-1">
                <Checkbox
                  id="accept-terms"
                  data-testid="checkbox-accept-terms"
                  checked={accepted}
                  onCheckedChange={(c) => setAccepted(c === true)}
                />
                <label htmlFor="accept-terms" className="text-xs leading-relaxed cursor-pointer">
                  Li o documento acima na íntegra, concordo com seus termos e declaro que sou a
                  pessoa identificada pelos dados acima. Esta declaração tem o mesmo efeito jurídico
                  de uma assinatura manuscrita.
                </label>
              </div>

              {submit.error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Não foi possível assinar</AlertTitle>
                  <AlertDescription>{(submit.error as Error).message}</AlertDescription>
                </Alert>
              )}

              <Button
                className="w-full"
                size="lg"
                disabled={!canSubmit}
                onClick={() => submit.mutate()}
                data-testid="btn-submit-signature"
              >
                {submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Assinar documento
              </Button>

              <p className="text-[10px] text-muted-foreground text-center pt-2 border-t">
                IONEX360 — Plataforma de gestão de clínicas estéticas
              </p>
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-muted/20">
      {children}
    </div>
  );
}
