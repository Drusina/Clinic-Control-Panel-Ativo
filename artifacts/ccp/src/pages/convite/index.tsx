import { useEffect, useState } from "react";
import { Bell, BellRing, BellOff, CheckCircle2, Loader2, User, Building2, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { storeToken } from "@/hooks/use-auth";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface MemberInfo {
  nome: string;
  funcao: string | null;
  email: string | null;
  clinicId: string;
  teamMemberId: string;
}

function PushSubscriptionCard({ clinicId }: { clinicId: string }) {
  const { permission, isSubscribed, isLoading, subscribe, unsubscribe } = usePushSubscription({ clinicId });
  const { toast } = useToast();

  if (permission === "unsupported") {
    return (
      <Card className="border-muted">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <BellOff className="h-4 w-4 shrink-0" />
            <span>Seu navegador não suporta notificações push.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (permission === "denied") {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <BellOff className="h-4 w-4 shrink-0 text-destructive" />
            <span>
              Notificações push bloqueadas. Acesse as configurações do seu navegador para habilitar as permissões para este site.
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isSubscribed) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <BellRing className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Notificações ativadas</p>
                <p className="text-xs text-muted-foreground">Você receberá alertas mesmo com o app fechado.</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={isLoading}
              onClick={async () => {
                const ok = await unsubscribe();
                if (ok) toast({ title: "Notificações push desativadas" });
              }}
            >
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Desativar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              <Bell className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Ativar notificações push</p>
              <p className="text-xs text-muted-foreground">Receba avisos de delegações e atualizações em tempo real.</p>
            </div>
          </div>
          <Button
            size="sm"
            disabled={isLoading}
            onClick={async () => {
              const ok = await subscribe();
              if (ok) {
                toast({ title: "Notificações push ativadas!", description: "Você será avisado sobre novas delegações." });
              } else if (typeof Notification !== "undefined" && Notification.permission === "denied") {
                toast({
                  variant: "destructive",
                  title: "Permissão negada",
                  description: "Altere as permissões do navegador para habilitar.",
                });
              }
            }}
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <BellRing className="h-3 w-3 mr-1" />}
            Ativar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ConvitePage() {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberInfo, setMemberInfo] = useState<MemberInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no_access">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [inviteToken, setInviteToken] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    const tok = params.get("tok");
    if (!ref || !tok) {
      setStatus("error");
      setErrorMessage("Link de convite inválido ou incompleto. Verifique o e-mail de convite e tente novamente.");
      return;
    }
    setMemberId(ref);
    setInviteToken(tok);
  }, []);

  useEffect(() => {
    if (!memberId || !inviteToken) return;

    async function authenticate() {
      try {
        const res = await fetch(`${BASE}/api/auth/convite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberId, inviteToken }),
        });

        if (res.status === 403) {
          setStatus("no_access");
          setErrorMessage("Seu acesso à plataforma ainda não foi habilitado. Solicite ao responsável da sua clínica.");
          return;
        }

        if (res.status === 401) {
          setStatus("error");
          setErrorMessage("Link de convite expirado. Solicite um novo convite ao responsável da sua clínica.");
          return;
        }

        if (res.status === 404) {
          setStatus("error");
          setErrorMessage("Link de convite inválido ou expirado. Solicite um novo convite.");
          return;
        }

        if (!res.ok) {
          setStatus("error");
          setErrorMessage("Não foi possível acessar a plataforma. Tente novamente.");
          return;
        }

        const data = await res.json() as {
          token: string;
          nome: string;
          funcao: string | null;
          email: string | null;
          clinicId: string;
          teamMemberId: string;
        };

        storeToken(data.token);
        setMemberInfo({
          nome: data.nome,
          funcao: data.funcao,
          email: data.email,
          clinicId: data.clinicId,
          teamMemberId: data.teamMemberId,
        });
        setStatus("ready");
      } catch {
        setStatus("error");
        setErrorMessage("Erro de conexão. Verifique sua internet e tente novamente.");
      }
    }

    authenticate();
  }, [memberId, inviteToken]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Acessando sua área...</p>
        </div>
      </div>
    );
  }

  if (status === "error" || status === "no_access") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <BellOff className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Acesso indisponível</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">IONEX360</h1>
          <p className="text-sm text-muted-foreground mt-1">Portal do membro da equipe</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-primary" />
              Bem-vindo(a)!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-lg font-semibold text-foreground">{memberInfo!.nome}</p>
              {memberInfo!.funcao && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                  <Briefcase className="h-3.5 w-3.5" />
                  <span>{memberInfo!.funcao}</span>
                </div>
              )}
              {memberInfo!.email && (
                <p className="text-sm text-muted-foreground mt-0.5">{memberInfo!.email}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-primary" />
              Notificações push
            </CardTitle>
            <CardDescription>
              Ative para receber avisos quando novas delegações forem criadas para você, mesmo com o navegador fechado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PushSubscriptionCard clinicId={memberInfo!.clinicId} />
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Você está conectado como membro da equipe. Suas notificações serão vinculadas a este dispositivo e navegador.
          </p>
        </div>
      </div>
    </div>
  );
}
