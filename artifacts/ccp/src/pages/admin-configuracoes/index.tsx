import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { getStoredToken } from "@/hooks/use-auth";

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
    </div>
  );
}
