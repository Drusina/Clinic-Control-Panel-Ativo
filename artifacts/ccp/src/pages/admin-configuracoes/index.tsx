import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Settings2,
  Trash2,
  Save,
  FileDown,
  RefreshCw,
  Mail,
  Send,
  Globe,
  KeyRound,
  ShieldAlert,
  Building2,
  FileSignature,
  FileText,
  ExternalLink,
} from "lucide-react";
import { getStoredToken, useLogout } from "@/hooks/use-auth";
import {
  useLgpdTemplates,
  useUpdateLgpdTemplate,
  previewLgpdTemplate,
  type LgpdTemplateData,
} from "@/hooks/use-kickoff-api";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { BancoPerguntasDialog } from "@/components/banco-perguntas-dialog";
import { ListChecks } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ConfigEntry {
  key: string;
  label: string;
  sensitive: boolean;
  hint: string;
  configured: boolean;
  source: "db" | "env" | "integration" | null;
  displayValue: string | null;
}

interface DocumentAccessLogEntry {
  id: string;
  objectPath: string;
  accessedBy: string;
  role: string;
  ipAddress: string | null;
  createdAt: string;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

// Validates the `app_url` config value the same way the backend does, so the
// admin gets immediate feedback without round-tripping. Returns a hard error
// (blocks save) and a soft warning (allows save but flags the value).
//
// Heuristic matches resolveAppUrl()/warnIfAppUrlLooksLikeMarketingSite() in
// artifacts/api-server/src/lib/email.ts.
function validateAppUrl(raw: string): { error: string | null; warning: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: null, warning: null };
  if (/[\s\r\n]/.test(trimmed)) {
    return { error: "URL não pode conter espaços ou quebras de linha", warning: null };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: "URL inválida — use o formato https://app.exemplo.com", warning: null };
  }
  if (parsed.protocol !== "https:") {
    return { error: "URL deve começar com https://", warning: null };
  }
  if (!/^[a-zA-Z0-9.\-]+(:\d{1,5})?$/.test(parsed.host)) {
    return { error: "Host inválido na URL", warning: null };
  }
  if ((parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash) {
    return {
      error: "Use apenas o domínio raiz (sem caminho, query ou fragmento)",
      warning: null,
    };
  }
  // Heuristic warning: the marketing site (clinionex.com.br without `app.`)
  // does not host the SPA routes, so links generated against it 404. This
  // already happened once, so we surface a visible amber warning before save.
  if (
    /clinionex\.com\.br/i.test(parsed.host) &&
    !/^app\.clinionex\.com\.br$/i.test(parsed.host)
  ) {
    return {
      error: null,
      warning:
        'Esse domínio parece ser o site institucional. Os links nos e-mails só funcionam quando apontam para "https://app.clinionex.com.br".',
    };
  }
  return { error: null, warning: null };
}

function ConfigRow({ entry, onSaved }: { entry: ConfigEntry; onSaved: () => void }) {
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [showValue, setShowValue] = useState(false);
  const qc = useQueryClient();

  const isAppUrl = entry.key === "app_url";
  const appUrlValidation = isAppUrl ? validateAppUrl(value) : { error: null, warning: null };
  // Strip trailing slash so the preview matches what the backend will store
  // and use when assembling the final link.
  const appUrlPreviewBase = isAppUrl ? value.trim().replace(/\/$/, "") : "";
  const saveDisabledByValidation = isAppUrl && (!value.trim() || !!appUrlValidation.error);

  const saveMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/config/integrations/${entry.key}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      }),
    onSuccess: () => {
      toast({ title: "Configuração salva" });
      setValue("");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["admin-config-integrations"] });
      onSaved();
    },
    onError: (e) => toast({ variant: "destructive", title: "Erro", description: (e as Error).message }),
  });

  const deleteMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/config/integrations/${entry.key}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Configuração removida" });
      qc.invalidateQueries({ queryKey: ["admin-config-integrations"] });
      onSaved();
    },
    onError: (e) => toast({ variant: "destructive", title: "Erro", description: (e as Error).message }),
  });

  return (
    <div className="space-y-2 py-4 border-b last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <Label className="text-sm font-medium">{entry.label}</Label>
            {entry.configured
              ? <Badge className="text-xs bg-green-100 text-green-800 border-green-300"><CheckCircle2 className="h-3 w-3 mr-1" />Configurado</Badge>
              : <Badge variant="outline" className="text-xs text-muted-foreground"><XCircle className="h-3 w-3 mr-1" />Não configurado</Badge>}
            {entry.source === "env" && (
              <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-400 bg-yellow-50">via variável de ambiente</Badge>
            )}
            {entry.source === "db" && (
              <Badge variant="outline" className="text-xs text-blue-700 border-blue-300 bg-blue-50">salvo no banco</Badge>
            )}
            {entry.source === "integration" && (
              <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-400 bg-emerald-50">via integração Replit</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{entry.hint}</p>
          {entry.source === "env" && (
            <p className="text-xs text-yellow-700 mt-0.5">Lido da variável de ambiente. Configure aqui para sobrescrever.</p>
          )}
          {entry.source === "integration" && (
            <p className="text-xs text-emerald-700 mt-0.5">Gerenciado pela integração Resend do Replit — chave rotacionada automaticamente.</p>
          )}
          {entry.configured && entry.displayValue && !editing && (
            <div className="flex items-center gap-2 mt-1">
              <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                {showValue && !entry.sensitive ? entry.displayValue : "••••••••"}
              </code>
              {!entry.sensitive && (
                <button onClick={() => setShowValue(v => !v)} className="text-muted-foreground hover:text-foreground">
                  {showValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          {!editing && entry.source !== "integration" && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              {entry.configured ? "Alterar" : "Configurar"}
            </Button>
          )}
          {entry.source === "db" && !editing && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => deleteMut.mutate()}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <Input
              type={entry.sensitive ? "password" : "text"}
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={
                isAppUrl
                  ? "https://app.clinionex.com.br"
                  : entry.configured
                    ? "Novo valor (deixe em branco para cancelar)"
                    : "Insira o valor"
              }
              className="font-mono text-sm"
              autoFocus
              data-testid={isAppUrl ? "input-app-url" : undefined}
              aria-invalid={isAppUrl && !!appUrlValidation.error}
            />
            <Button
              size="sm"
              onClick={() => saveMut.mutate()}
              disabled={
                !value.trim() ||
                saveMut.isPending ||
                saveDisabledByValidation
              }
              data-testid={isAppUrl ? "btn-save-app-url" : undefined}
            >
              {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setEditing(false); setValue(""); }}
            >
              Cancelar
            </Button>
          </div>
          {isAppUrl && appUrlValidation.error && (
            <p
              className="text-xs text-destructive flex items-start gap-1.5"
              data-testid="app-url-error"
            >
              <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{appUrlValidation.error}</span>
            </p>
          )}
          {isAppUrl && appUrlValidation.warning && !appUrlValidation.error && (
            <div
              className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              data-testid="app-url-warning"
            >
              <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{appUrlValidation.warning}</span>
            </div>
          )}
          {isAppUrl && value.trim() && !appUrlValidation.error && (
            <p className="text-xs text-muted-foreground" data-testid="app-url-preview">
              Os links em e-mails vão começar com{" "}
              <code className="font-mono bg-muted px-1.5 py-0.5 rounded">
                {appUrlPreviewBase}/assinar/...
              </code>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface TestResult {
  ok: boolean;
  user?: { name: string; email: string };
  error?: string;
}

interface TestEmailResult {
  ok: boolean;
  error?: string;
  from?: string;
  replyTo?: string | null;
  to?: string;
}

interface ResendDomainStatusResponse {
  name: string;
  status: string;
  region: string | null;
  records: Array<{ record: string; name: string; type: string; status: string }>;
}

function ResendDomainStatusCard({ disabled }: { disabled: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const query = useQuery<ResendDomainStatusResponse>({
    queryKey: ["admin-resend-domain-status"],
    queryFn: () => apiFetch<ResendDomainStatusResponse>("/api/admin/resend/domain-status"),
    enabled: !disabled,
    staleTime: 30_000,
    // Poll while the domain is still in a non-terminal state so the operator
    // sees verification flip to green without manually refreshing. Stops
    // polling once verified (interval=false) — also skipped on errors so we
    // don't hammer Resend if the API key is misconfigured.
    refetchInterval: (q) => {
      const data = q.state.data;
      if (q.state.error || !data) return false;
      return data.status === "verified" ? false : 30_000;
    },
    retry: false,
  });

  const verifyMut = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; name: string }>("/api/admin/resend/verify-domain", { method: "POST" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-resend-domain-status"] });
      const fresh = await query.refetch();
      if (fresh.data?.status === "verified") {
        toast({ title: "Domínio verificado", description: `${fresh.data.name} está pronto para envio.` });
      } else {
        toast({
          title: "Verificação solicitada",
          description: "DNS ainda não confirmado. Aguarde a propagação (até algumas horas) e tente novamente.",
        });
      }
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Falha ao verificar domínio", description: e.message });
    },
  });

  if (disabled) return null;

  const status = query.data?.status;
  const isVerified = status === "verified";
  const isPending = status === "pending";
  const isNotStarted = status === "not_started";

  const recordsPending = (query.data?.records ?? []).filter(r => r.status !== "verified");

  return (
    <div className="mt-4 p-3 rounded-md border border-dashed bg-muted/30 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Domínio de envio</span>
          {query.data?.name && <code className="text-xs font-mono text-muted-foreground">{query.data.name}</code>}
        </div>
        {query.isLoading ? (
          <Badge variant="outline" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
          </Badge>
        ) : query.isError ? (
          <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-500/30 gap-1" data-testid="badge-resend-domain-status">
            <XCircle className="h-3 w-3" /> Erro ao consultar
          </Badge>
        ) : isVerified ? (
          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1" data-testid="badge-resend-domain-status">
            <CheckCircle2 className="h-3 w-3" /> Domínio verificado
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 gap-1" data-testid="badge-resend-domain-status">
            <XCircle className="h-3 w-3" /> Domínio {isPending ? "aguardando DNS" : isNotStarted ? "não iniciado" : status ?? "desconhecido"}
          </Badge>
        )}
      </div>

      {query.isError && (
        <p className="text-xs text-red-700">
          {(query.error as Error)?.message ?? "Não foi possível consultar o status do domínio."}
        </p>
      )}

      {!isVerified && !query.isLoading && !query.isError && (
        <>
          <p className="text-xs text-muted-foreground">
            Os e-mails só serão enviados pelo domínio quando o Resend confirmar SPF e DKIM.
            {recordsPending.length > 0 && (
              <> Pendente: {recordsPending.map(r => `${r.type} ${r.name}`).join(", ")}.</>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => verifyMut.mutate()}
              disabled={verifyMut.isPending}
              data-testid="button-resend-verify-domain"
            >
              {verifyMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              Reverificar agora
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function EmailTestCard({ disabled }: { disabled: boolean }) {
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [result, setResult] = useState<TestEmailResult | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!to.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await apiFetch<TestEmailResult>("/api/admin/config/integrations/test-email", {
        method: "POST",
        body: JSON.stringify({ to: to.trim() }),
      });
      setResult(res);
      if (res.ok) {
        toast({ title: "E-mail de teste enviado", description: `Verifique a caixa de entrada de ${to.trim()}.` });
      } else {
        toast({ variant: "destructive", title: "Falha no envio", description: res.error });
      }
    } catch (e) {
      const msg = (e as Error).message;
      setResult({ ok: false, error: msg });
      toast({ variant: "destructive", title: "Erro ao enviar", description: msg });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-4 p-3 rounded-md border border-dashed bg-muted/30 space-y-3">
      <div className="flex items-center gap-2">
        <Send className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Enviar e-mail de teste</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Envie um e-mail de teste para validar a configuração do remetente, do reply-to e do domínio.
      </p>
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="seu-email@exemplo.com"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="text-sm"
          disabled={disabled || sending}
        />
        <Button size="sm" onClick={handleSend} disabled={disabled || sending || !to.trim()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-3.5 w-3.5 mr-1.5" />Enviar</>}
        </Button>
      </div>
      {disabled && (
        <p className="text-xs text-yellow-700">
          Configure a Resend API Key acima antes de testar o envio.
        </p>
      )}
      {result && (
        <div className={`flex items-start gap-2 text-sm rounded-md px-3 py-2 ${result.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {result.ok
            ? (
              <>
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div>E-mail enviado para <strong>{result.to}</strong></div>
                  <div className="text-xs mt-0.5 opacity-80">
                    Remetente: <code>{result.from}</code>
                    {result.replyTo && <> · Reply-To: <code>{result.replyTo}</code></>}
                  </div>
                </div>
              </>
            )
            : (
              <>
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{result.error}</span>
              </>
            )
          }
        </div>
      )}
    </div>
  );
}

interface TokenSecretStatus {
  source: "env" | "db" | null;
  canRotate: boolean;
  lastRotatedAt: string | null;
}

interface TokenSecretRotation {
  id: string;
  rotatedAt: string;
  actorRole: string | null;
  actorEmail: string | null;
  actorSub: string | null;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describeActor(r: TokenSecretRotation): string {
  if (r.actorEmail) return r.actorEmail;
  if (r.actorSub && r.actorSub !== "super_admin") return r.actorSub;
  if (r.actorRole === "super_admin") return "super-admin";
  if (r.actorRole) return r.actorRole;
  return "desconhecido";
}

function SecuritySection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const logout = useLogout();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: status, isLoading: statusLoading } = useQuery<TokenSecretStatus>({
    queryKey: ["token-signing-secret-status"],
    queryFn: () => apiFetch("/api/admin/token-signing-secret/status"),
  });

  const { data: rotations = [], isLoading: rotationsLoading } = useQuery<TokenSecretRotation[]>({
    queryKey: ["token-signing-secret-rotations"],
    queryFn: () => apiFetch("/api/admin/token-signing-secret/rotations"),
  });

  const rotateMut = useMutation({
    mutationFn: () =>
      apiFetch<{ success: boolean }>("/api/admin/rotate-token-signing-secret", {
        method: "POST",
      }),
    onSuccess: () => {
      setConfirmOpen(false);
      toast({
        title: "Chave de assinatura rotacionada",
        description: "Todas as sessões foram invalidadas. Faça login novamente.",
      });
      // Refresh the status + history so if the operator stays on the page
      // after re-login (or another tab is open) they immediately see the new
      // entry. We invalidate before logout so it triggers before the auth
      // header is dropped — the next mount will refetch with the new token.
      qc.invalidateQueries({ queryKey: ["token-signing-secret-status"] });
      qc.invalidateQueries({ queryKey: ["token-signing-secret-rotations"] });
      // The token we currently hold was signed by the old secret and is now
      // rejected by verifyToken. Drop it locally and bounce to the login page
      // so the operator immediately re-authenticates.
      logout();
      setLocation("/admin/login");
    },
    onError: (e) => {
      setConfirmOpen(false);
      toast({
        variant: "destructive",
        title: "Erro ao rotacionar",
        description: (e as Error).message,
      });
    },
  });

  const envManaged = status?.source === "env";
  const canRotate = !!status?.canRotate;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" /> Segurança — Chave de Assinatura de Sessão
        </CardTitle>
        <CardDescription className="text-sm">
          Gera um novo segredo aleatório usado para assinar os tokens de sessão. Útil se você suspeita
          que a chave atual foi exposta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {envManaged ? (
          <div className="flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-900">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              A chave atual vem da variável de ambiente <code className="font-mono">TOKEN_SIGNING_SECRET</code>,
              que tem prioridade sobre o banco de dados. Para rotacionar, altere o valor diretamente
              em <strong>Deployments → Secrets</strong> e reinicie o servidor — caso contrário, qualquer
              rotação aqui seria sobrescrita no próximo boot.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              <strong>Atenção:</strong> ao rotacionar, todos os usuários (incluindo você) serão
              desconectados imediatamente e precisarão fazer login novamente. Em ambientes com
              múltiplas instâncias do servidor, reinicie todas as réplicas após a rotação para que a
              chave nova seja propagada.
            </p>
          </div>
        )}

        <div
          className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
          data-testid="token-secret-last-rotated"
        >
          <span className="font-medium text-foreground">Última rotação: </span>
          {statusLoading
            ? "carregando…"
            : status?.lastRotatedAt
              ? formatDateTime(status.lastRotatedAt)
              : "—"}
          {!statusLoading && status?.lastRotatedAt && rotations.length === 0 && (
            <span className="ml-1 italic">
              (gerada automaticamente no primeiro boot — ainda não houve rotação manual)
            </span>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={statusLoading || !canRotate || rotateMut.isPending}
          data-testid="btn-rotate-token-secret"
        >
          {rotateMut.isPending
            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Rotacionando…</>
            : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Rotacionar chave de sessão</>}
        </Button>

        <div className="pt-1">
          <p className="text-xs font-medium text-foreground mb-1.5">Histórico de rotações</p>
          {rotationsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando histórico…
            </div>
          ) : rotations.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma rotação manual registrada ainda.
            </p>
          ) : (
            <ul
              className="text-xs divide-y rounded-md border bg-background"
              data-testid="token-secret-rotation-history"
            >
              {rotations.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <span className="text-muted-foreground whitespace-nowrap">
                    {formatDateTime(r.rotatedAt)}
                  </span>
                  <span className="font-mono text-foreground truncate" title={describeActor(r)}>
                    {describeActor(r)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => { if (!rotateMut.isPending) setConfirmOpen(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotacionar chave de assinatura?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação gera uma nova chave secreta usada para assinar os tokens de login.{" "}
              <strong>Todos os usuários serão desconectados imediatamente</strong> e precisarão
              fazer login novamente — incluindo você. Tem certeza?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rotateMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); rotateMut.mutate(); }}
              disabled={rotateMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="btn-confirm-rotate-token-secret"
            >
              {rotateMut.isPending
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Rotacionando…</>
                : "Sim, rotacionar agora"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function DocumentAccessLogSection() {
  const { data: entries = [], isLoading, refetch, isFetching } = useQuery<DocumentAccessLogEntry[]>({
    queryKey: ["document-access-log"],
    queryFn: () => apiFetch("/api/admin/document-access-log?limit=50"),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileDown className="h-4 w-4 text-muted-foreground" />
              Log de Acesso a Documentos
            </CardTitle>
            <CardDescription className="text-sm">
              Registro de todos os acessos a documentos privados (Proposta, Contrato, etc.).
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando registros…
          </div>
        )}
        {!isLoading && entries.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum acesso registrado ainda.</p>
        )}
        {!isLoading && entries.length > 0 && (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="pb-2 px-2 font-medium">Data/Hora</th>
                  <th className="pb-2 px-2 font-medium">Usuário</th>
                  <th className="pb-2 px-2 font-medium">Papel</th>
                  <th className="pb-2 px-2 font-medium">Documento</th>
                  <th className="pb-2 px-2 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 px-2 whitespace-nowrap text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="py-2 px-2 font-mono">{entry.accessedBy}</td>
                    <td className="py-2 px-2">
                      <Badge variant="outline" className="text-xs">
                        {entry.role}
                      </Badge>
                    </td>
                    <td className="py-2 px-2 font-mono max-w-[200px] truncate" title={entry.objectPath}>
                      {entry.objectPath}
                    </td>
                    <td className="py-2 px-2 text-muted-foreground">{entry.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && entries.length === 50 && (
          <p className="text-xs text-muted-foreground mt-3 text-center">Exibindo os 50 acessos mais recentes.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ContratadaCard({ entries, onSaved }: { entries: ConfigEntry[]; onSaved: () => void }) {
  const allConfigured = entries.length > 0 && entries.every(e => e.configured);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> Dados da Contratada
            </CardTitle>
            <CardDescription className="text-sm">
              Razão social, CNPJ e responsável legal usados nos termos LGPD assinados pelos clientes.
            </CardDescription>
          </div>
          {allConfigured ? (
            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/15 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Completo
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1">
              <XCircle className="h-3 w-3" /> Incompleto
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">Carregando…</p>
        )}
        {entries.map(entry => (
          <ConfigRow key={entry.key} entry={entry} onSaved={onSaved} />
        ))}
      </CardContent>
    </Card>
  );
}

function LgpdTemplatesCard() {
  const { data: templates = [], isLoading } = useLgpdTemplates();
  const [editing, setEditing] = useState<LgpdTemplateData | null>(null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-primary" /> Modelos de Documentos LGPD
        </CardTitle>
        <CardDescription className="text-sm">
          Edite o conteúdo padrão dos termos enviados aos signatários. Use{" "}
          <code className="font-mono text-xs">{"{{contratada.razao_social}}"}</code>,{" "}
          <code className="font-mono text-xs">{"{{contratante.cnpj}}"}</code>,{" "}
          <code className="font-mono text-xs">{"{{contratante.responsavel}}"}</code> e{" "}
          <code className="font-mono text-xs">{"{{data}}"}</code> como variáveis (a lista completa aparece dentro do editor).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando modelos…
          </div>
        )}
        {!isLoading && templates.length === 0 && (
          <p className="text-sm text-muted-foreground py-3">Nenhum modelo cadastrado.</p>
        )}
        <ul className="divide-y">
          {templates.map(t => (
            <li key={t.slug} className="py-3 flex items-start justify-between gap-3" data-testid={`row-template-${t.slug}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium truncate">{t.titulo}</p>
                  <Badge variant="outline" className="text-xs">v{t.versao}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.descricao}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{t.slug}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    previewLgpdTemplate(t.slug).catch(e =>
                      alert((e as Error).message),
                    )
                  }
                  data-testid={`btn-preview-template-${t.slug}`}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> Preview
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(t)}
                  data-testid={`btn-edit-template-${t.slug}`}
                >
                  Editar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
      <TemplateEditDialog
        template={editing}
        onClose={() => setEditing(null)}
      />
    </Card>
  );
}

function TemplateEditDialog({
  template,
  onClose,
}: {
  template: LgpdTemplateData | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const updateMut = useUpdateLgpdTemplate();
  const [titulo, setTitulo] = useState("");
  const [corpo, setCorpo] = useState("");

  // Reset draft whenever the dialog opens with a different template.
  useEffect(() => {
    if (template) {
      setTitulo(template.titulo);
      setCorpo(template.corpo);
    }
  }, [template?.slug, template?.versao]);

  function handleClose() {
    setTitulo("");
    setCorpo("");
    onClose();
  }

  function handleSave() {
    if (!template) return;
    updateMut.mutate(
      { slug: template.slug, titulo: titulo.trim(), corpo },
      {
        onSuccess: () => {
          toast({ title: "Modelo atualizado", description: `Nova versão salva.` });
          handleClose();
        },
        onError: (e) =>
          toast({ variant: "destructive", title: "Erro ao salvar", description: (e as Error).message }),
      },
    );
  }

  function handlePreview() {
    if (!template) return;
    previewLgpdTemplate(template.slug, { titulo: titulo.trim(), corpo }).catch(e =>
      toast({ variant: "destructive", title: "Erro no preview", description: (e as Error).message }),
    );
  }

  return (
    <Dialog open={!!template} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar modelo</DialogTitle>
          <DialogDescription className="text-xs">
            Suporta cabeçalhos com <code>#</code>, listas com <code>-</code> e linhas em branco para
            quebrar parágrafos. Use variáveis entre <code>{"{{ }}"}</code>.
          </DialogDescription>
        </DialogHeader>
        {template && (
          <div className="space-y-3 overflow-y-auto pr-1 flex-1">
            <div className="space-y-1">
              <Label>Título</Label>
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                data-testid="input-template-titulo"
              />
            </div>
            <div className="space-y-1">
              <Label>Conteúdo</Label>
              <Textarea
                value={corpo}
                onChange={(e) => setCorpo(e.target.value)}
                rows={20}
                className="font-mono text-xs"
                data-testid="textarea-template-corpo"
              />
            </div>
            <div className="text-xs text-muted-foreground rounded-md border bg-muted/30 p-2 space-y-1">
              <p>
                <strong className="text-foreground">Variáveis da contratada (BLU SOLLUTTIONS):</strong>{" "}
                <code>{"{{contratada.razao_social}}"}</code>, <code>{"{{contratada.cnpj}}"}</code>,{" "}
                <code>{"{{contratada.endereco}}"}</code>, <code>{"{{contratada.cidade_uf}}"}</code>,{" "}
                <code>{"{{contratada.cep}}"}</code>, <code>{"{{contratada.representante_nome}}"}</code>,{" "}
                <code>{"{{contratada.representante_cpf}}"}</code>,{" "}
                <code>{"{{contratada.representante_cargo}}"}</code>.
              </p>
              <p>
                <strong className="text-foreground">Variáveis da contratante (clínica):</strong>{" "}
                <code>{"{{contratante.razao_social}}"}</code>, <code>{"{{contratante.nome_fantasia}}"}</code>,{" "}
                <code>{"{{contratante.cnpj}}"}</code>, <code>{"{{contratante.endereco}}"}</code>,{" "}
                <code>{"{{contratante.cidade_uf}}"}</code>, <code>{"{{contratante.cep}}"}</code>,{" "}
                <code>{"{{contratante.responsavel}}"}</code>.
              </p>
              <p>
                <strong className="text-foreground">Outras:</strong>{" "}
                <code>{"{{data}}"}</code> (data atual no formato "DD de mês de AAAA").
              </p>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={updateMut.isPending}>
            Cancelar
          </Button>
          <Button variant="outline" onClick={handlePreview} disabled={updateMut.isPending}>
            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Preview
          </Button>
          <Button onClick={handleSave} disabled={updateMut.isPending || !titulo.trim() || !corpo.trim()}>
            {updateMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Save className="h-3.5 w-3.5 mr-1" /> Salvar nova versão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BancoPerguntasCard() {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" /> Banco de Perguntas do Diagnóstico
        </CardTitle>
        <CardDescription className="text-sm">
          Importe perguntas em massa via planilha CSV/XLSX (com pré-visualização do diff antes de
          confirmar) ou restaure o seed padrão.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          data-testid="btn-open-banco-perguntas"
        >
          <FileDown className="h-4 w-4 mr-2 rotate-180" /> Importar perguntas / Restaurar seed
        </Button>
        {open && <BancoPerguntasDialog onClose={() => setOpen(false)} />}
      </CardContent>
    </Card>
  );
}

export default function AdminConfiguracoesPage() {
  const { toast: _toast } = useToast();
  const qc = useQueryClient();

  const { data: entries = [], isLoading } = useQuery<ConfigEntry[]>({
    queryKey: ["admin-config-integrations"],
    queryFn: () => apiFetch("/api/admin/config/integrations"),
  });

  const contratadaKeys = entries.filter(e => e.key.startsWith("contratada_"));
  const emailKeys = entries.filter(e =>
    e.key === "resend_api_key" ||
    e.key === "resend_from_address" ||
    e.key === "reply_to_address"
  );
  const appUrlKey = entries.find(e => e.key === "app_url");
  const resendApiKeyConfigured = !!emailKeys.find(e => e.key === "resend_api_key")?.configured;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings2 className="h-6 w-6 text-primary" /> Configurações de Integrações
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Configure as credenciais de serviços externos. Os valores são armazenados de forma segura no banco de dados.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando configurações…
        </div>
      )}

      {!isLoading && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" /> E-mail Oficial — Resend
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Configurações de envio de e-mails transacionais (convites, delegações, alertas, assinaturas).
                  </CardDescription>
                </div>
                {resendApiKeyConfigured ? (
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/15 gap-1" data-testid="badge-resend-status">
                    <CheckCircle2 className="h-3 w-3" /> Resend conectado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1" data-testid="badge-resend-status">
                    <XCircle className="h-3 w-3" /> Resend não configurado
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {emailKeys.map(entry => (
                <ConfigRow key={entry.key} entry={entry} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-config-integrations"] })} />
              ))}
              <div className="mt-4 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">Como configurar o domínio <code className="font-mono">clinionex.com.br</code> no Resend</p>
                <ol className="list-decimal list-inside space-y-1.5 ml-1">
                  <li>Acesse <a href="https://resend.com/domains" target="_blank" rel="noopener" className="text-primary underline">resend.com/domains</a> e clique em <strong>Add Domain</strong>.</li>
                  <li>Informe <code className="font-mono">clinionex.com.br</code> e selecione a região mais próxima do Brasil.</li>
                  <li>Adicione no painel DNS da Hostinger (zona do domínio) os seguintes registros mostrados pelo Resend:
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                      <li><strong>SPF</strong> (TXT em <code className="font-mono">@</code>): <code className="font-mono break-all">v=spf1 include:_spf.resend.com ~all</code></li>
                      <li><strong>DKIM</strong> (CNAME em <code className="font-mono">resend._domainkey</code>): valor exato fornecido pelo Resend</li>
                      <li><strong>MX</strong> (opcional, somente se for receber bounces): conforme instruções do Resend</li>
                      <li><strong>DMARC</strong> (opcional, recomendado): TXT em <code className="font-mono">_dmarc</code> com <code className="font-mono break-all">v=DMARC1; p=none; rua=mailto:gestor@blusolution.com.br</code></li>
                    </ul>
                  </li>
                  <li>Aguarde a verificação no Resend (de 5 minutos a algumas horas). Quando estiver verde, salve o endereço <code className="font-mono">noreply@clinionex.com.br</code> em <strong>Endereço remetente (From)</strong> acima.</li>
                  <li>Use o teste abaixo para validar o envio.</li>
                </ol>
              </div>
              <ResendDomainStatusCard disabled={!resendApiKeyConfigured} />
              <EmailTestCard disabled={!resendApiKeyConfigured} />
            </CardContent>
          </Card>

          {appUrlKey && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" /> URL Pública da Plataforma
                </CardTitle>
                <CardDescription className="text-sm">
                  URL base usada nos links incluídos em todos os e-mails (convites, delegações, etc).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ConfigRow entry={appUrlKey} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-config-integrations"] })} />
              </CardContent>
            </Card>
          )}

          <ContratadaCard
            entries={contratadaKeys}
            onSaved={() => qc.invalidateQueries({ queryKey: ["admin-config-integrations"] })}
          />

          <LgpdTemplatesCard />

          <BancoPerguntasCard />
        </>
      )}

      <SecuritySection />

      <DocumentAccessLogSection />
    </div>
  );
}
