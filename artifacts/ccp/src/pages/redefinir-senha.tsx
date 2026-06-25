import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { Loader2, KeyRound, CheckCircle2 } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function RedefinirSenhaPage() {
  const [, navigate] = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (!t) {
      setError("Link de redefinição inválido.");
      return;
    }
    setToken(t);
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
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
      const res = await fetch(`${BASE}/api/auth/redefinir-senha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, novaSenha }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Não foi possível redefinir a senha.");
        return;
      }
      setDone(true);
      setTimeout(() => navigate("/entrar", { replace: true }), 2500);
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
          <Brand className="text-2xl" />
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              {done ? <CheckCircle2 className="h-10 w-10 text-primary" /> : <KeyRound className="h-10 w-10 text-primary" />}
            </div>
            <CardTitle>{done ? "Senha redefinida!" : "Criar nova senha"}</CardTitle>
            <CardDescription>
              {done
                ? "Sua nova senha foi salva. Redirecionando para a tela de entrada..."
                : "Escolha uma nova senha pessoal para acessar a plataforma."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="text-center">
                <Link href="/entrar" className="text-primary hover:underline text-sm">
                  Ir para entrar agora
                </Link>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nova-senha">Nova senha (mínimo 8 caracteres)</Label>
                  <Input
                    id="nova-senha"
                    type="password"
                    value={novaSenha}
                    onChange={(e) => { setNovaSenha(e.target.value); setError(null); }}
                    autoComplete="new-password"
                    data-testid="input-nova-senha-reset"
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
                    data-testid="input-confirmar-senha-reset"
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
                  disabled={isLoading || !token || !novaSenha || !confirmar}
                  data-testid="btn-redefinir-senha"
                >
                  {isLoading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
                  ) : "Salvar nova senha"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
