import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Search, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useCurrentRole, getActiveClinicId } from "@/hooks/use-auth";
import { useClinicsForCurrentUser } from "@/hooks/use-clinics-for-current-user";

export interface ClinicSelectorListProps {
  /** Page title shown above the list (e.g. "Documentos"). */
  title: string;
  /** One-line helper text under the title. */
  description: string;
  /** Destination route for a super_admin choosing a clinic. */
  hrefForClinic: (clinicId: string) => string;
  /**
   * Portal module slug used to build the default team_member bounce target
   * (`/portal/<module>/<clinicId>`). Ignored when `teamMemberRedirect` is set.
   */
  portalModule?: string;
  /**
   * Overrides the team_member bounce target. Receives the resolved active
   * clinic id (the active selection, or their only clinic) or `null` when the
   * manager has 2+ clinics and none is active. When omitted, the redirect is
   * derived from `portalModule` (falling back to the `/me/clinicas` chooser).
   */
  teamMemberRedirect?: (resolvedClinicId: string | null) => string;
}

const CHOOSER_ROUTE = "/me/clinicas";

/**
 * Shared "Selecionar Clínica" screen used by every clinic-scoped module
 * (documentos, evidências, riscos, plano de ação, processos, delegação,
 * relatórios, diagnóstico). Renders a single, consistent vertical list with
 * search for super_admin.
 *
 * Clinic-first isolation is preserved: a team_member never sees a list of
 * their other clinics. They are bounced to their active clinic (or their only
 * clinic); with 2+ clinics and none active they go to the `/me/clinicas`
 * chooser. While the role is still resolving, a spinner is shown so other
 * clinics never flash for a manager.
 */
export function ClinicSelectorList({
  title,
  description,
  hrefForClinic,
  portalModule,
  teamMemberRedirect,
}: ClinicSelectorListProps) {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const { data: user } = useCurrentRole();
  const isTeamMember = user?.role === "team_member";
  const isSuperAdmin = user?.role === "super_admin";
  const { clinics, isLoading } = useClinicsForCurrentUser({ pageSize: 100 });

  useEffect(() => {
    if (!isTeamMember || isLoading) return;
    const active = getActiveClinicId();
    const match =
      (active && clinics.find((c) => c.id === active)) ||
      (clinics.length === 1 ? clinics[0] : undefined);
    const resolved = match?.id ?? null;
    const dest = teamMemberRedirect
      ? teamMemberRedirect(resolved)
      : resolved && portalModule
        ? `/portal/${portalModule}/${resolved}`
        : CHOOSER_ROUTE;
    navigate(dest, { replace: true });
  }, [isTeamMember, isLoading, clinics, navigate, portalModule, teamMemberRedirect]);

  // Only a confirmed super_admin renders the clinic list. While the role is
  // still loading (user undefined) `isSuperAdmin` is false, so we show a
  // spinner instead of flashing other clinics.
  if (!isSuperAdmin) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const term = search.toLowerCase();
  const filtered = clinics.filter(
    (c) =>
      c.nome.toLowerCase().includes(term) ||
      (c.cidade ?? "").toLowerCase().includes(term),
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar clínica..."
          className="pl-9"
        />
      </div>
      {isLoading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(hrefForClinic(c.id))}
              className="w-full text-left p-4 border rounded-lg hover:bg-muted/50 transition-colors flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{c.nome}</div>
                <div className="text-sm text-muted-foreground">
                  {c.cidade}
                  {c.uf ? `, ${c.uf}` : ""}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma clínica encontrada.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
