import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Rocket, Search, ArrowRight } from "lucide-react";
import { useClinicsForCurrentUser } from "@/hooks/use-clinics-for-current-user";
import { useCurrentRole, getActiveClinicId } from "@/hooks/use-auth";

export default function KickoffSelectPage() {
  const [location, navigate] = useLocation();
  const [search, setSearch] = useState("");

  const { data: user } = useCurrentRole();
  const isSuperAdmin = user?.role === "super_admin";
  const isTeamMember = user?.role === "team_member";
  // Portal-aware navigation: a manager stays inside `/portal/...`.
  const isPortal = location.startsWith("/portal");
  const kickoffBase = isPortal ? "/portal/kickoff" : "/kickoff";

  // super_admin → browse the full kickoff list (status-filtered server-side).
  // team_member → load all their clinics; we scope to the active one below.
  const { clinics, isLoading } = useClinicsForCurrentUser({
    status: isSuperAdmin ? "kickoff" : undefined,
    pageSize: 100,
  });

  const activeClinicId = getActiveClinicId();

  // Clinic-first: a manager with 2+ clinics and no active selection is sent
  // back to the chooser before any clinic-scoped data is shown.
  useEffect(() => {
    if (!isTeamMember || isLoading) return;
    if (clinics.length === 0) return; // ClinicAccessGuard handles this
    const resolved = activeClinicId && clinics.some((c) => c.id === activeClinicId);
    if (!resolved && clinics.length > 1) {
      navigate("/me/clinicas", { replace: true });
    }
  }, [isTeamMember, isLoading, clinics, activeClinicId, navigate]);

  // Visible list. Super admins see every clinic in kickoff; a manager only
  // ever sees the clinic they entered, and only while it is in the kickoff
  // stage.
  const scoped = useMemo(() => {
    if (isSuperAdmin) return clinics;
    const active =
      (activeClinicId && clinics.find((c) => c.id === activeClinicId)) ||
      (clinics.length === 1 ? clinics[0] : undefined);
    if (!active) return [];
    return active.status === "kickoff" ? [active] : [];
  }, [isSuperAdmin, clinics, activeClinicId]);

  const filtered = isSuperAdmin
    ? scoped.filter(
        (c) =>
          c.nome.toLowerCase().includes(search.toLowerCase()) ||
          (c.cidade ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : scoped;

  function open(clinicId: string) {
    navigate(`${kickoffBase}/${clinicId}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Rocket className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Kick-off</h1>
          <p className="text-sm text-muted-foreground">
            {isSuperAdmin
              ? "Selecione uma clínica para iniciar ou continuar o onboarding"
              : "Onboarding da clínica ativa"}
          </p>
        </div>
      </div>

      {isSuperAdmin && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar clínica por nome ou cidade…"
            className="pl-9"
          />
        </div>
      )}

      {isLoading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Rocket className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="font-medium">
              {isSuperAdmin
                ? "Nenhuma clínica em fase de kick-off"
                : "Esta clínica não está em fase de kick-off"}
            </p>
            <p className="text-sm mt-1">
              {isSuperAdmin
                ? 'Clínicas com status "kickoff" aparecem aqui automaticamente'
                : "O kick-off fica disponível quando a clínica entra na etapa de onboarding"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(clinic => (
            <Card key={clinic.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => open(clinic.id)}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{clinic.nome}</CardTitle>
                    <CardDescription>{[clinic.cidade, clinic.uf].filter(Boolean).join(", ") || "Localização não informada"}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs capitalize">{clinic.status}</Badge>
                    <Button size="sm" variant="ghost">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
