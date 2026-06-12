import { useEffect } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { Loader2, Building2, ArrowRight, MapPin } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useCurrentRole,
  useMyClinics,
  setActiveClinicId,
  useLogout,
} from "@/hooks/use-auth";

/**
 * Multi-clinic chooser.
 *  - 0 clinics → friendly "no access" panel + logout
 *  - 1 clinic  → auto-redirect into the clinic workspace
 *  - 2+        → grid of cards, click to enter
 *
 * Super admins are redirected to `/admin/clinicas` (they have a richer
 * management view there). This page is the post-login landing for
 * `team_member`.
 */
export default function MeClinicasPage() {
  const [, navigate] = useLocation();
  const { data: user, isLoading: roleLoading } = useCurrentRole();
  const { data, isLoading } = useMyClinics();
  const logout = useLogout();

  const clinics = data?.clinics ?? [];

  useEffect(() => {
    // 1-clinic team members: skip the chooser entirely.
    if (isLoading || roleLoading) return;
    if (user?.role !== "team_member") return;
    if (clinics.length !== 1) return;
    const only = clinics[0];
    setActiveClinicId(only.id);
    navigate("/portal", { replace: true });
  }, [isLoading, roleLoading, clinics, user?.role, navigate]);

  if (roleLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !user.role) {
    return <Redirect to="/admin/login" />;
  }

  if (user.role === "super_admin") {
    return <Redirect to="/admin/clinicas" />;
  }

  if (clinics.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Sem clínicas vinculadas</CardTitle>
            <CardDescription>
              Seu acesso à plataforma ainda não foi habilitado em nenhuma clínica.
              Solicite o convite ao responsável da sua clínica.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={() => logout().then(() => navigate("/admin/login"))}>
              Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Minhas clínicas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Selecione a clínica que deseja acessar.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {clinics.map((c) => (
          <Link
            key={c.id}
            href="/portal"
            onClick={() => setActiveClinicId(c.id)}
          >
            <Card className="group cursor-pointer hover:border-primary/50 transition-colors h-full">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 shrink-0">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  {c.status && (
                    <Badge variant={c.status === "ativa" ? "default" : "secondary"}>
                      {c.status}
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-base mt-3 line-clamp-2">
                  {c.fantasia || c.nome}
                </CardTitle>
                {c.fantasia && c.fantasia !== c.nome && (
                  <CardDescription className="line-clamp-1">{c.nome}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {(c.cidade || c.uf) && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>
                      {[c.cidade, c.uf].filter(Boolean).join(" / ")}
                    </span>
                  </div>
                )}
                {c.etapa && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{c.etapa}</span>
                    <span className="font-medium text-foreground">
                      {c.progresso}%
                    </span>
                  </div>
                )}
                {/* Styled as a button but rendered as a div: the whole card
                    is already an <a> (Link), so a nested <button> would be
                    invalid HTML. */}
                <div className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors group-hover:bg-primary/90">
                  <span className="truncate">Entrar — {c.fantasia || c.nome}</span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
