import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Activity, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSwitchSession } from "@/hooks/use-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function EntrarPage() {
  const [, navigate] = useLocation();
  const switchSession = useSwitchSession();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !senha) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/auth/entrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), senha }),
      });
      if (res.status === 429) {
        setError("Muitas tentativas. Tente novamente em alguns minutos.");
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Não foi possível entrar. Verifique suas credenciais.");
        return;
      }
      const data = (await res.json()) as { token: string; senhaProvisoria: boolean };
      await switchSession(data.token);
      if (data.senhaProvisoria) {
        navigate("/trocar-senha", { replace: true });
      } else {
        navigate("/me/clinicas", { replace: true });
      }
    } catch {
      setError("Erro de conexão. Verifique sua internet e tente novamente.");
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
              <LogIn className="h-10 w-10 text-primary" />
            </div>
            <CardTitle>Entrar na plataforma</CardTitle>
            <CardDescription>
              Use seu e-mail e senha cadastrados para acessar o portal da sua clínica.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  placeholder="voce@clinica.com.br"
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senha">Senha</Label>
                <Input
                  id="senha"
                  type="password"
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => { setSenha(e.target.value); setError(null); }}
                  placeholder="••••••••"
                  data-testid="input-senha"
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
                disabled={isLoading || !email.trim() || !senha}
                data-testid="btn-entrar"
              >
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Entrando...</>
                ) : "Entrar"}
              </Button>

              <div className="text-center text-sm">
                <Link href="/esqueci-senha" className="text-primary hover:underline">
                  Esqueci minha senha
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-4">
          É administrador da Blu Sollutions?{" "}
          <Link href="/admin/login" className="text-primary hover:underline">
            Entrar como super-admin
          </Link>
        </p>
      </div>
    </div>
  );
}
