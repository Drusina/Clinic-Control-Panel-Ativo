import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  AlertTriangle,
  Building2,
  ArrowRight,
  CheckCircle2,
  Clock,
  LogOut,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const RESPONDENT_TOKEN_KEY = "ccp_respondent_token";

/**
 * Identidade do respondente — derivada do redeem (`POST /auth/responder`)
 * ou do próprio hub. NÃO contém mais `delegacaoId/pilar*` fixos (esses vêm
 * por hub/URL). Mantidos opcionais por compat com tokens v:1 (o backend
 * devolve o vínculo inicial no payload, e o wizard pode pular o hub se a
 * lista tiver 1 item).
 */
export interface ResponderIdentity {
  token: string;
  clinicId: string;
  clinicNome: string | null;
  diagnosticoId: string;
  diagnosticoStatus: string;
  responsavelNome: string | null;
  responsavelEmail: string | null;
  // Compat v:1: o backend ainda devolve a delegação inicial.
  delegacaoId?: string;
  pilarSlug?: string;
  pilarNome?: string;
  prazo?: string | null;
}

interface HubCard {
  delegacaoId: string;
  pilarSlug: string;
  pilarNome: string;
  nivel: number;
  prazo: string | null;
  status: string;
  kind: "pilar" | "perguntas";
  total: number;
  answered: number;
  delegated: number;
  pending: number;
}

interface HubResponse {
  clinicId: string;
  clinicNome: string | null;
  diagnosticoId: string;
  diagnosticoStatus: string | null;
  responsavelNome: string | null;
  responsavelEmail: string | null;
  delegacoes: HubCard[];
}

export default function ResponderEntrypoint() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"redeeming" | "ready" | "error">(
    "redeeming",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [identity, setIdentity] = useState<ResponderIdentity | null>(null);

  // 1. Redeem (se vier ?code= na URL) OU recupera sessão salva.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    // Sem code: assume sessão pré-existente. Sem sessão → erro.
    if (!code) {
      const existing = getRespondentIdentity();
      if (!existing) {
        setErrorMessage(
          "Você precisa abrir o link recebido por e-mail para acessar seus pilares.",
        );
        setStatus("error");
        return;
      }
      setIdentity(existing);
      setStatus("ready");
      return;
    }

    history.replaceState(null, "", window.location.pathname);
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/auth/responder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setErrorMessage(
            body?.error ??
              "Não foi possível abrir o diagnóstico. Solicite um novo link ao gestor.",
          );
          setStatus("error");
          return;
        }
        const data = (await res.json()) as ResponderIdentity;
        sessionStorage.setItem(RESPONDENT_TOKEN_KEY, data.token);
        sessionStorage.setItem(
          `${RESPONDENT_TOKEN_KEY}_identity`,
          JSON.stringify(data),
        );
        // Limpa o ctx legado (formato amarrado à delegação) para evitar que
        // o wizard leia contexto obsoleto.
        sessionStorage.removeItem(`${RESPONDENT_TOKEN_KEY}_ctx`);
        setIdentity(data);
        setStatus("ready");
      } catch {
        setErrorMessage("Erro de conexão. Tente novamente em instantes.");
        setStatus("error");
      }
    })();
  }, []);

  const token = identity?.token ?? null;

  // 2. Carrega o hub.
  const hubQuery = useQuery<HubResponse>({
    queryKey: ["respondent-hub"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/respondent/hub`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("hub failed");
      return res.json() as Promise<HubResponse>;
    },
    enabled: !!token && status === "ready",
  });

  // 3. Auto-redirect quando há 1 só card.
  useEffect(() => {
    const data = hubQuery.data;
    if (!data || data.delegacoes.length !== 1) return;
    const only = data.delegacoes[0];
    navigate(`/responder/wizard?delegacaoId=${encodeURIComponent(only.delegacaoId)}`, {
      replace: true,
    });
  }, [hubQuery.data, navigate]);

  const cards = useMemo(() => hubQuery.data?.delegacoes ?? [], [hubQuery.data]);

  if (status === "redeeming") {
    return (
      <CenteredSpinner label="Abrindo seu diagnóstico…" />
    );
  }

  if (status === "error") {
    return (
      <ErrorScreen
        message={errorMessage}
        onBack={() => {
          clearRespondentSession();
          navigate("/responder/saiu", { replace: true });
        }}
      />
    );
  }

  if (hubQuery.isLoading) {
    return <CenteredSpinner label="Carregando seus pilares…" />;
  }

  if (hubQuery.isError) {
    return (
      <ErrorScreen
        message="Não foi possível carregar seus pilares. Solicite um novo link ao gestor."
        onBack={() => {
          clearRespondentSession();
          navigate("/responder/saiu", { replace: true });
        }}
      />
    );
  }

  const hub = hubQuery.data!;

  if (cards.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <ListChecks className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Nenhum pilar atribuído</CardTitle>
            <CardDescription>
              Não há pilares ativos para você neste momento. O gestor da clínica
              precisa criar uma delegação para o seu e-mail.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => {
                clearRespondentSession();
                navigate("/responder/saiu", { replace: true });
              }}
            >
              <LogOut className="h-4 w-4 mr-2" /> Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground leading-none">IONEX360</p>
              <p className="text-sm font-semibold leading-tight">
                {hub.clinicNome ?? "Diagnóstico"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const clinic = hub.clinicNome;
              clearRespondentSession();
              navigate(
                clinic
                  ? `/responder/saiu?clinic=${encodeURIComponent(clinic)}`
                  : "/responder/saiu",
                { replace: true },
              );
            }}
          >
            <LogOut className="h-4 w-4 mr-1" /> Sair
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold">Olá, {hub.responsavelNome ?? "Respondente"}</h1>
          <p className="text-sm text-muted-foreground">
            Você foi indicado(a) para responder os pilares abaixo. Escolha um
            para começar — suas respostas são salvas automaticamente.
          </p>
        </div>

        {hub.diagnosticoStatus === "concluido" && (
          <div className="rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Este diagnóstico já foi <strong>encerrado pelo gestor</strong>.
              Você pode revisar suas respostas, mas elas não podem mais ser
              editadas.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3">
          {cards.map((c) => {
            const pct = c.total > 0 ? Math.round((c.answered / c.total) * 100) : 0;
            const completed = c.total > 0 && c.pending === 0;
            return (
              <Card
                key={c.delegacaoId}
                className={completed ? "border-green-300/60" : undefined}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{c.pilarNome}</CardTitle>
                        {c.kind === "perguntas" && (
                          <Badge variant="outline" className="text-[10px]">
                            Perguntas avulsas
                          </Badge>
                        )}
                        {completed && (
                          <Badge className="bg-green-600 hover:bg-green-600 gap-1 text-[10px]">
                            <CheckCircle2 className="h-3 w-3" /> Concluído
                          </Badge>
                        )}
                        {!completed && c.answered > 0 && (
                          <Badge variant="secondary" className="text-[10px]">
                            Em andamento
                          </Badge>
                        )}
                        {!completed && c.answered === 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            Pendente
                          </Badge>
                        )}
                      </div>
                      {c.prazo && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Prazo: {c.prazo}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() =>
                        navigate(
                          `/responder/wizard?delegacaoId=${encodeURIComponent(c.delegacaoId)}`,
                        )
                      }
                    >
                      {completed ? "Revisar" : c.answered > 0 ? "Continuar" : "Responder"}
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>
                      {c.answered} respondidas
                      {c.delegated > 0 ? ` · ${c.delegated} delegadas` : ""}
                      {" "}/ {c.total}
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <Progress value={pct} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function ErrorScreen({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Não foi possível abrir o diagnóstico</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 pt-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            <span>IONEX360 — Diagnóstico 360°</span>
          </div>
          <Button variant="outline" onClick={onBack}>
            Voltar
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sessão (helpers compartilhados com o wizard) ──────────────────────────

export function getRespondentToken(): string | null {
  return sessionStorage.getItem(RESPONDENT_TOKEN_KEY);
}

export function getRespondentIdentity(): ResponderIdentity | null {
  const raw = sessionStorage.getItem(`${RESPONDENT_TOKEN_KEY}_identity`);
  if (raw) {
    try {
      return JSON.parse(raw) as ResponderIdentity;
    } catch {
      // fallthrough — tenta ler o ctx legado
    }
  }
  // Compat: se só tem o ctx antigo (formato amarrado à delegação), reusa o
  // que dá. Tokens v:1 continuam válidos; o wizard segue funcionando.
  const legacy = sessionStorage.getItem(`${RESPONDENT_TOKEN_KEY}_ctx`);
  if (!legacy) return null;
  try {
    const parsed = JSON.parse(legacy) as {
      token: string;
      clinicId: string;
      clinicNome?: string | null;
      diagnosticoId: string;
      diagnosticoStatus?: string;
      responsavelNome?: string | null;
      responsavelEmail?: string | null;
      delegacaoId?: string;
      pilarSlug?: string;
      pilarNome?: string;
      prazo?: string | null;
    };
    return {
      token: parsed.token,
      clinicId: parsed.clinicId,
      clinicNome: parsed.clinicNome ?? null,
      diagnosticoId: parsed.diagnosticoId,
      diagnosticoStatus: parsed.diagnosticoStatus ?? "em_andamento",
      responsavelNome: parsed.responsavelNome ?? null,
      responsavelEmail: parsed.responsavelEmail ?? null,
      delegacaoId: parsed.delegacaoId,
      pilarSlug: parsed.pilarSlug,
      pilarNome: parsed.pilarNome,
      prazo: parsed.prazo,
    };
  } catch {
    return null;
  }
}

/** @deprecated mantenha apenas para compat — prefira getRespondentIdentity. */
export function getRespondentContext(): ResponderIdentity | null {
  return getRespondentIdentity();
}

export function clearRespondentSession(): void {
  sessionStorage.removeItem(RESPONDENT_TOKEN_KEY);
  sessionStorage.removeItem(`${RESPONDENT_TOKEN_KEY}_identity`);
  sessionStorage.removeItem(`${RESPONDENT_TOKEN_KEY}_ctx`);
}
