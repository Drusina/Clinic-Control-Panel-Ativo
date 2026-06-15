import { Link, useLocation } from "wouter";
import {
  Activity,
  Bell,
  Settings,
  LogOut,
  ChevronDown,
  Building2,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { NotificationPreferencesModal } from "@/components/notification-preferences-modal";
import { ClinicLogo } from "@/components/clinic-logo";
import {
  useMyClinics,
  useLogout,
  getActiveClinicId,
} from "@/hooks/use-auth";

function resolveActiveClinicId(
  location: string,
  myClinicIds: string[],
): string | null {
  // Extract any UUID-shaped segment in the URL (e.g. /portal/clinica/:id).
  // Match by UUID shape directly so hyphenated section names like
  // "rede-externa" don't break the lookup.
  const urlMatch = location.match(
    /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i,
  );
  if (urlMatch && myClinicIds.includes(urlMatch[1])) return urlMatch[1];
  const stored = getActiveClinicId();
  if (stored && myClinicIds.includes(stored)) return stored;
  // Clinic-first: only auto-resolve when there is exactly one clinic. With
  // 2+ clinics and no explicit selection we return null so the UI prompts
  // the manager to choose — never silently default to the first clinic,
  // which could surface the wrong clinic during a client-facing session.
  return myClinicIds.length === 1 ? myClinicIds[0] : null;
}

/**
 * PortalLayout — slim global chrome for the clinic manager (`team_member`).
 *
 * After the unified "Painel da Clínica" landed, modules no longer live in the
 * chrome. The top bar only carries cross-clinic affordances: the active
 * clinic (+ "Trocar clínica"), Notificações, Preferências and Sair. All
 * module navigation happens INSIDE the panel (`/portal/clinica/:id/:secao`).
 */
export function PortalLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [prefsOpen, setPrefsOpen] = useState(false);

  const { data: myClinicsData } = useMyClinics();
  const logout = useLogout();
  const myClinics = myClinicsData?.clinics ?? [];

  const activeClinicId = useMemo(
    () =>
      resolveActiveClinicId(
        location,
        myClinics.map((c) => c.id),
      ),
    [location, myClinics],
  );
  const activeClinic = myClinics.find((c) => c.id === activeClinicId) ?? null;
  const hasMultipleClinics = myClinics.length >= 2;

  const clinicLabel =
    activeClinic?.fantasia || activeClinic?.nome || "Selecionar clínica";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground sm:px-6">
        {/* Left: brand + active clinic */}
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/portal"
            className="flex items-center gap-2 font-bold tracking-tight"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground">
              <Activity className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">IONEX360</span>
          </Link>

          <div className="h-6 w-px bg-sidebar-border" />

          {myClinics.length > 0 &&
            (hasMultipleClinics ? (
              <Button
                variant="ghost"
                className="h-9 min-w-0 gap-2 px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                onClick={() => navigate("/me/clinicas")}
                data-testid="portal-trocar-clinica"
                title="Trocar clínica"
              >
                <ClinicLogo
                  clinicId={activeClinic?.id ?? ""}
                  logoUrl={activeClinic?.logoUrl}
                  name={clinicLabel}
                  className="h-5 w-5 shrink-0 rounded"
                  fallback={<Building2 className="h-4 w-4 shrink-0 text-primary" />}
                />
                <span className="truncate text-sm font-medium">
                  {clinicLabel}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
              </Button>
            ) : (
              <div
                className="flex min-w-0 items-center gap-2 px-2"
                data-testid="portal-active-clinic"
              >
                <ClinicLogo
                  clinicId={activeClinic?.id ?? ""}
                  logoUrl={activeClinic?.logoUrl}
                  name={clinicLabel}
                  className="h-5 w-5 shrink-0 rounded"
                  fallback={<Building2 className="h-4 w-4 shrink-0 text-primary" />}
                />
                <span className="truncate text-sm font-medium">
                  {clinicLabel}
                </span>
              </div>
            ))}
        </div>

        {/* Right: notifications, preferences, logout */}
        <div className="flex items-center gap-1">
          <Link href="/portal/notificacoes">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              title="Notificações"
              data-testid="portal-notificacoes"
            >
              <Bell className="h-4 w-4" />
              <span className="sr-only">Notificações</span>
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => setPrefsOpen(true)}
            title="Preferências"
            data-testid="portal-preferencias"
          >
            <Settings className="h-4 w-4" />
            <span className="sr-only">Preferências</span>
          </Button>

          <div className="mx-1 h-6 w-px bg-sidebar-border" />

          <Button
            variant="ghost"
            className="h-9 gap-2 px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={async () => {
              await logout();
              navigate("/entrar");
            }}
            data-testid="portal-logout-button"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
      </main>

      <NotificationPreferencesModal open={prefsOpen} onOpenChange={setPrefsOpen} />
    </div>
  );
}
