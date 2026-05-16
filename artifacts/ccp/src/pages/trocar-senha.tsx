import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Activity, Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getStoredToken, useCurrentRole } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function TrocarSenhaPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const me = useCurrentRole();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Quando o usuário chega aqui via /convite e ainda não tem credencial,
  // o backend devolve precisaCriarSenha=true e não exigimos senhaAtual.
  const [precisaCriar, setPrecisaCriar] = useState(false);

  useEffect(() => {
    // Se o login devolveu senhaProvisoria=true mas o usuário acabou de chegar
    // do /convite (sem credencial), persistimos via sessionStorage.
    const flag = sessionStorage.getItem("ccp_precisa_criar_senha");
    if (flag === "1") setPrecisaCriar(true);
  }, []);

  useEffect(() => {
    if (!me.isLoading && me.data?.role !== "team_member") {
      navigate("/entrar", { replace: true });
    }
  }, [me.isLoading, me.data?.role, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (novaSenha.length < 8) {
      setError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (novaSenha !== confirmar) {
      setError("As senhas não coincidem.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const token = getStoredToken();
      const endpoint = precisaCriar ? "/api/auth/criar-senha-inicial" : "/api/auth/trocar-senha";
      const payload = precisaCriar ? { novaSenha } : { senhaAtual, novaSenha };
      const res = await fetch(`${BASE}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Não foi possível trocar a senha.");
        return;
      }
      sessionStorage.removeItem("ccp_precisa_criar_senha");
      // Atualiza o cache de /auth/me imediatamente (antes do navigate) para
      // que o ProvisionalPasswordGate não veja `senhaProvisoria=true` stale
      // e bounce o usuário de volta para /trocar-senha durante o refetch.
      qc.setQueryData<{ senhaProvisoria: boolean | null } | undefined>(
        ["auth", "me"],
        (prev) => (prev ? { ...prev, senhaProvisoria: false } : prev),
      );
      // Dispara o refetch em background para sincronizar com o servidor,
      // mas não bloqueia a navegação.
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
      // Respeita ?next= injetado pelo ProvisionalPasswordGate; fallback para
      // a lista de clínicas do usuário.
      let dest = "/me/clinicas";
      try {
        const params = new URLSearchParams(window.location.search);
        const next = params.get("next");
        if (next && next.startsWith("/") && !next.startsWith("//")) {
          dest = next;
        }
      } catch {
        /* ignore */
      }
      navigate(dest, { replace: true });
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Activity className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold tracking-tight">
            IONEX<span className="text-muted-foreground">360</span>
          </span>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <KeyRound className="h-10 w-10 text-primary" />
            </div>
            <CardTitle>{precisaCriar ? "Crie sua senha" : "Crie sua senha definitiva"}</CardTitle>
            <CardDescription>
              {precisaCriar
                ? "Defina uma senha pessoal para acessar a plataforma sem precisar do link de convite."
                : "Sua senha atual é provisória. Escolha agora uma senha pessoal para continuar."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              {!precisaCriar && (
                <div className="space-y-2">
                  <Label htmlFor="senha-atual">Senha atual (provisória)</Label>
                  <Input
                    id="senha-atual"
                    type="password"
                    value={senhaAtual}
                    onChange={(e) => { setSenhaAtual(e.target.value); setError(null); }}
                    autoComplete="current-password"
                    data-testid="input-senha-atual"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="nova-senha">Nova senha (mínimo 8 caracteres)</Label>
                <Input
                  id="nova-senha"
                  type="password"
                  value={novaSenha}
                  onChange={(e) => { setNovaSenha(e.target.value); setError(null); }}
                  autoComplete="new-password"
                  data-testid="input-nova-senha"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmar">Confirmar nova senha</Label>
                <Input
                  id="confirmar"
                  type="password"
                  value={confirmar}
                  onChange={(e) => { setConfirmar(e.target.value); setError(null); }}
                  autoComplete="new-password"
                  data-testid="input-confirmar-senha"
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || (!precisaCriar && !senhaAtual) || !novaSenha || !confirmar}
                data-testid="btn-trocar-senha"
              >
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
                ) : "Salvar nova senha"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
