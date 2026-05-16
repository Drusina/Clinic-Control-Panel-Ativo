import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, AlertTriangle, Building2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const RESPONDENT_TOKEN_KEY = "ccp_respondent_token";

interface ResponderSession {
  token: string;
  delegacaoId: string;
  clinicId: string;
  clinicNome: string | null;
  diagnosticoId: string;
  diagnosticoStatus: string;
  pilarSlug: string;
  pilarNome: string;
  responsavelNome: string | null;
  responsavelEmail: string | null;
  prazo: string | null;
}

export default function ResponderEntrypoint() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    history.replaceState(null, "", window.location.pathname);
    if (!code) {
      setErrorMessage(
        "Link inválido ou incompleto. Verifique o e-mail recebido e tente novamente.",
      );
      setStatus("error");
      return;
    }

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
            body?.error ?? "Não foi possível abrir o diagnóstico. Solicite um novo link ao gestor.",
          );
          setStatus("error");
          return;
        }
        const data = (await res.json()) as ResponderSession;
        sessionStorage.setItem(RESPONDENT_TOKEN_KEY, data.token);
        sessionStorage.setItem(`${RESPONDENT_TOKEN_KEY}_ctx`, JSON.stringify(data));
        navigate("/responder/wizard", { replace: true });
      } catch {
        setErrorMessage("Erro de conexão. Tente novamente em instantes.");
        setStatus("error");
      }
    })();
  }, [navigate]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Abrindo seu diagnóstico…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Não foi possível abrir o diagnóstico</CardTitle>
          <CardDescription>{errorMessage}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 pt-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            <span>IONEX360 — Diagnóstico 360°</span>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              clearRespondentSession();
              navigate("/responder/saiu", { replace: true });
            }}
          >
            Voltar
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function getRespondentToken(): string | null {
  return sessionStorage.getItem(RESPONDENT_TOKEN_KEY);
}

export function getRespondentContext(): ResponderSession | null {
  const raw = sessionStorage.getItem(`${RESPONDENT_TOKEN_KEY}_ctx`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ResponderSession;
  } catch {
    return null;
  }
}

export function clearRespondentSession(): void {
  sessionStorage.removeItem(RESPONDENT_TOKEN_KEY);
  sessionStorage.removeItem(`${RESPONDENT_TOKEN_KEY}_ctx`);
}
