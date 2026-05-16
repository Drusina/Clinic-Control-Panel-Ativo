import { useState } from "react";
import { Link } from "wouter";
import { Activity, Loader2, Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);
    try {
      await fetch(`${BASE}/api/auth/esqueci-senha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      // sempre mostramos a mesma mensagem
    } finally {
      setIsLoading(false);
      setSent(true);
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
              {sent ? <CheckCircle2 className="h-10 w-10 text-primary" /> : <Mail className="h-10 w-10 text-primary" />}
            </div>
            <CardTitle>{sent ? "Verifique seu e-mail" : "Esqueci minha senha"}</CardTitle>
            <CardDescription>
              {sent
                ? "Se este e-mail estiver cadastrado, enviamos um link para você criar uma nova senha. O link é válido por 1 hora."
                : "Informe o e-mail cadastrado para receber um link de redefinição de senha."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="text-center">
                <Link href="/entrar" className="text-primary hover:underline text-sm">
                  Voltar para entrar
                </Link>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@clinica.com.br"
                    data-testid="input-email-reset"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || !email.trim()}
                  data-testid="btn-enviar-reset"
                >
                  {isLoading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</>
                  ) : "Enviar link de redefinição"}
                </Button>
                <div className="text-center text-sm">
                  <Link href="/entrar" className="text-muted-foreground hover:text-foreground hover:underline">
                    Voltar para entrar
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
