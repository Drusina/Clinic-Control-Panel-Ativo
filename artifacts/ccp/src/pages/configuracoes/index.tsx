import { Link, Redirect } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, KeyRound, Loader2, Mail, ShieldCheck, User } from "lucide-react";
import { useCurrentRole } from "@/hooks/use-auth";
import { NotificationPreferencesPanel } from "@/components/notification-preferences-panel";

function roleLabel(role: string | null | undefined): string {
  if (role === "super_admin") return "Super administrador";
  if (role === "team_member") return "Gestor de clínica";
  return "—";
}

export default function ConfiguracoesPage() {
  const { data: user, isLoading } = useCurrentRole();

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user?.role) {
    return <Redirect to="/entrar" />;
  }

  const isTeamMember = user.role === "team_member";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Preferências de notificação e dados da sua conta.
        </p>
      </div>

      <Tabs defaultValue="notificacoes" className="space-y-6">
        <TabsList>
          <TabsTrigger value="notificacoes" className="gap-2" data-testid="tab-notificacoes">
            <Bell className="h-4 w-4" />
            Preferências de notificação
          </TabsTrigger>
          <TabsTrigger value="conta" className="gap-2" data-testid="tab-conta">
            <User className="h-4 w-4" />
            Dados da conta
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notificacoes">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Bell className="h-5 w-5 text-primary" />
                Preferências de notificação
              </CardTitle>
              <CardDescription>
                Configure os canais de notificação (email e WhatsApp) por membro da equipe.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NotificationPreferencesPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conta">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <User className="h-5 w-5 text-primary" />
                Dados da conta
              </CardTitle>
              <CardDescription>
                Informações da sua sessão atual.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-2 rounded-md bg-muted">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground uppercase tracking-wide">Nome</dt>
                    <dd className="text-sm font-medium text-foreground" data-testid="conta-nome">
                      {user.nome || "—"}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-2 rounded-md bg-muted">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground uppercase tracking-wide">Email</dt>
                    <dd className="text-sm font-medium text-foreground" data-testid="conta-email">
                      {user.email || "—"}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-2 rounded-md bg-muted">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground uppercase tracking-wide">Perfil de acesso</dt>
                    <dd className="text-sm font-medium text-foreground" data-testid="conta-perfil">
                      {roleLabel(user.role)}
                    </dd>
                  </div>
                </div>
              </dl>

              <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
                <Link href="/trocar-senha">
                  <Button variant="outline" className="gap-2">
                    <KeyRound className="h-4 w-4" />
                    Trocar senha
                  </Button>
                </Link>
                {isTeamMember && (
                  <Link href="/me/clinicas">
                    <Button variant="ghost" className="gap-2">
                      Minhas clínicas
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
