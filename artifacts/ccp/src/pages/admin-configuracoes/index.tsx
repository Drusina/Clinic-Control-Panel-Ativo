import { useState } from "react";
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
  FlaskConical,
  Trash2,
  Save,
  FileDown,
  RefreshCw,
  Mail,
  Send,
  Globe,
  KeyRound,
  ShieldAlert,
} from "lucide-react";
import { getStoredToken, useLogout } from "@/hooks/use-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ConfigEntry {
  key: string;
  label: string;
  sensitive: boolean;
  hint: string;
  configured: boolean;
  source: "db" | "env" | null;
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

function ConfigRow({ entry, onSaved }: { entry: ConfigEntry; onSaved: () => void }) {
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [showValue, setShowValue] = useState(false);
  const qc = useQueryClient();

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
          </div>
          <p className="text-xs text-muted-foreground">{entry.hint}</p>
          {entry.source === "env" && (
            <p className="text-xs text-yellow-700 mt-0.5">Lido da variável de ambiente. Configure aqui para sobrescrever.</p>
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
          {!editing && (
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
        <div className="flex gap-2 mt-2">
          <Input
            type={entry.sensitive ? "password" : "text"}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={entry.configured ? "Novo valor (deixe em branco para cancelar)" : "Insira o valor"}
            className="font-mono text-sm"
            autoFocus
          />
          <Button
            size="sm"
            onClick={() => saveMut.mutate()}
            disabled={!value.trim() || saveMut.isPending}
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

export default function AdminConfiguracoesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const { data: entries = [], isLoading } = useQuery<ConfigEntry[]>({
    queryKey: ["admin-config-integrations"],
    queryFn: () => apiFetch("/api/admin/config/integrations"),
  });

  async function testAutentique() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch<TestResult>("/api/admin/config/integrations/test-autentique", {
        method: "POST",
      });
      setTestResult(result);
      if (result.ok) {
        toast({ title: `Autentique conectado como: ${result.user?.name} (${result.user?.email})` });
      } else {
        toast({ variant: "destructive", title: "Falha na conexão", description: result.error });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao testar", description: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  const autentiqueKeys = entries.filter(e =>
    e.key === "autentique_token" || e.key === "autentique_webhook_secret"
  );
  const supabaseKeys = entries.filter(e =>
    e.key === "supabase_url" || e.key === "supabase_service_role_key"
  );
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

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Autentique — Assinatura Digital</CardTitle>
                  <CardDescription className="text-sm">
                    Necessário para enviar documentos LGPD para assinatura eletrônica.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={testAutentique}
                  disabled={testing || !autentiqueKeys.find(e => e.key === "autentique_token")?.configured}
                >
                  {testing
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Testando…</>
                    : <><FlaskConical className="h-3.5 w-3.5 mr-1.5" />Testar conexão</>}
                </Button>
              </div>
              {testResult && (
                <div className={`mt-2 flex items-center gap-2 text-sm rounded-md px-3 py-2 ${testResult.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                  {testResult.ok
                    ? <><CheckCircle2 className="h-4 w-4" /> Conectado como <strong>{testResult.user?.name}</strong> ({testResult.user?.email})</>
                    : <><XCircle className="h-4 w-4" /> {testResult.error}</>}
                </div>
              )}
            </CardHeader>
            <CardContent>
              {autentiqueKeys.map(entry => (
                <ConfigRow key={entry.key} entry={entry} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-config-integrations"] })} />
              ))}
              <div className="mt-3 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground space-y-1">
                <p><strong>Webhook URL</strong> para configurar no Autentique:</p>
                <code className="block bg-muted rounded px-2 py-1 font-mono break-all select-all">
                  {`${window.location.origin}/api/autentique/webhook`}
                </code>
                <p>Configure o header <code>x-autentique-secret</code> com o mesmo valor do Webhook Secret acima.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Supabase — Armazenamento de Documentos</CardTitle>
              <CardDescription className="text-sm">
                Necessário para upload de PDFs nos Documentos Constitutivos e LGPD.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {supabaseKeys.map(entry => (
                <ConfigRow key={entry.key} entry={entry} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-config-integrations"] })} />
              ))}
              <div className="mt-3 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground space-y-1">
                <p>Crie um bucket chamado <code className="font-mono">signed-docs</code> para documentos LGPD e <code className="font-mono">clinic-docs</code> para documentos constitutivos no seu projeto Supabase.</p>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <SecuritySection />

      <DocumentAccessLogSection />
    </div>
  );
}
