import { useEffect, useState } from "react";
import { Building2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ResponderSaiuPage() {
  const [clinicNome, setClinicNome] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("clinic");
    if (fromQuery) {
      setClinicNome(fromQuery);
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
          <CardTitle>Sessão encerrada</CardTitle>
          <CardDescription>
            Sua sessão de resposta foi encerrada com segurança.
            {clinicNome ? ` Obrigado por contribuir com ${clinicNome}.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 pt-2">
          <p className="text-xs text-muted-foreground text-center">
            Você pode fechar esta aba. Para retomar o diagnóstico mais tarde,
            reabra o link enviado no seu e-mail.
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            <span>IONEX360 — Diagnóstico 360°</span>
          </div>
          <Button variant="outline" onClick={() => window.close()}>
            Fechar esta aba
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
