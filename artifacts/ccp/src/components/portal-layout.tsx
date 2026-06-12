import { Link, useLocation } from "wouter";
import {
  Building2,
  LayoutDashboard,
  Bell,
  Settings,
  Menu,
  Activity,
  ClipboardList,
  Users,
  ShieldAlert,
  KanbanSquare,
  ChevronDown,
  GitFork,
  Image,
  FileText,
  LogOut,
  ArrowLeftRight,
  AlertTriangle,
  Stethoscope,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { NotificationPreferencesModal } from "@/components/notification-preferences-modal";
import {
  useMyClinics,
  useLogout,
  getActiveClinicId,
} from "@/hooks/use-auth";

interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
}

function resolveActiveClinicId(
  location: string,
  myClinicIds: string[],
): string | null {
  // Extract any UUID-shaped segment in the URL (e.g. /portal/rede-externa/:id).
  // Match by UUID shape directly so hyphenated module names like
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
 * PortalLayout — chrome dedicado ao gestor da clínica (`team_member`).
 * Sidebar enxuto com itens operacionais, sem nada de super_admin.
 * Reaproveita os mesmos componentes de UI / hooks do AppLayout, mas
 * sem itens administrativos (Dashboard global, lista de Clínicas,
 * Templates ICS, Integrações).
 */
export function PortalLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [operacionalOpen, setOperacionalOpen] = useState(
    location.startsWith("/portal/delegacao") ||
      location.startsWith("/portal/riscos") ||
      location.startsWith("/portal/acao"),
  );
  const [complementarOpen, setComplementarOpen] = useState(
    location.startsWith("/portal/processos") ||
      location.startsWith("/portal/evidencias") ||
      location.startsWith("/portal/documentos") ||
      location.startsWith("/portal/relatorios"),
  );
  const [prefsOpen, setPrefsOpen] = useState(false);

  const { data: myClinicsData } = useMyClinics();
  const logout = useLogout();
  const myClinics = myClinicsData?.clinics ?? [];

  const activeClinicId = useMemo(
    () => resolveActiveClinicId(
      location,
      myClinics.map((c) => c.id),
    ),
    [location, myClinics],
  );
  const activeClinic = myClinics.find((c) => c.id === activeClinicId) ?? null;

  const scopedHref = (base: string): string =>
    activeClinicId ? `${base}/${activeClinicId}` : `${base}`;

  const navigation: NavItem[] = [
    { name: "Visão Geral", href: "/portal", icon: LayoutDashboard },
    { name: "Kickoff", href: "/portal/kickoff", icon: Activity },
    {
      name: "Diagnóstico 360°",
      href: "/portal/diagnostico/select",
      icon: ClipboardList,
    },
    { name: "Notificações", href: "/portal/notificacoes", icon: Bell },
  ];

  const operacionalNav: NavItem[] = [
    { name: "Delegação", href: scopedHref("/portal/delegacao"), icon: Users },
    {
      name: "Mapa de Riscos",
      href: scopedHref("/portal/riscos"),
      icon: ShieldAlert,
    },
    {
      name: "Plano de Ação",
      href: scopedHref("/portal/acao"),
      icon: KanbanSquare,
    },
    {
      name: "Processos",
      href: scopedHref("/portal/processos"),
      icon: GitFork,
    },
    {
      name: "Evidências",
      href: scopedHref("/portal/evidencias"),
      icon: Image,
    },
    {
      name: "Documentos",
      href: scopedHref("/portal/documentos"),
      icon: FileText,
    },
  ];

  const complementarNav: NavItem[] = [
    {
      name: "Equipe Interna",
      href: scopedHref("/portal/equipe"),
      icon: Stethoscope,
    },
    {
      name: "Rede Externa",
      href: scopedHref("/portal/rede-externa"),
      icon: GitFork,
    },
  ];

  const hasMultipleClinics = myClinics.length >= 2;

  // Sidebar context block: shows the active clinic (read-only) and an
  // explicit "Trocar clínica" button (only when 2+ clinics) that takes the
  // manager back to the chooser. Replaces the old silent dropdown so the
  // active clinic can never change by accident during a client session.
  const ClinicContext = () => {
    if (myClinics.length === 0) return null;
    return (
      <div className="px-4 pb-2 space-y-2">
        <div className="rounded-md border border-sidebar-border bg-sidebar-accent/30 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
                Clínica ativa
              </div>
              <div className="truncate text-sm font-medium text-sidebar-foreground">
                {activeClinic?.fantasia ||
                  activeClinic?.nome ||
                  "Nenhuma selecionada"}
              </div>
            </div>
          </div>
        </div>
        {hasMultipleClinics && (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center gap-2"
            onClick={() => navigate("/me/clinicas")}
            data-testid="portal-trocar-clinica"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Trocar clínica
          </Button>
        )}
      </div>
    );
  };

  // Top-of-content banner shown on every portal page. Makes the active
  // clinic unmistakable during client-facing presentations. When the
  // manager has multiple clinics but none is active, it turns into a
  // prompt to pick one before continuing.
  const ClinicContextBanner = () => {
    if (!activeClinic && hasMultipleClinics) {
      return (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">
              Nenhuma clínica selecionada. Escolha uma para continuar.
            </span>
          </div>
          <Button size="sm" onClick={() => navigate("/me/clinicas")}>
            Selecionar clínica
          </Button>
        </div>
      );
    }
    if (!activeClinic) return null;
    return (
      <div
        className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
        data-testid="portal-active-clinic-banner"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 shrink-0">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="truncate font-semibold">
                {activeClinic.fantasia || activeClinic.nome}
              </span>
              {activeClinic.status && (
                <Badge
                  variant={activeClinic.status === "ativa" ? "default" : "secondary"}
                  className="capitalize"
                >
                  {activeClinic.status}
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              Modo ativo — você está operando esta clínica
            </span>
          </div>
        </div>
        {hasMultipleClinics && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
            onClick={() => navigate("/me/clinicas")}
            data-testid="portal-banner-trocar-clinica"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Trocar clínica
          </Button>
        )}
      </div>
    );
  };

  const SidebarContent = () => (
    <div className="flex h-full flex-col gap-4 py-4">
      <div className="px-6 py-2 flex items-center gap-2">
        <Activity className="h-6 w-6 text-primary" />
        <div className="flex flex-col leading-tight">
          <span className="text-base font-bold tracking-tight text-sidebar-primary">
            Portal<span className="text-sidebar-foreground"> do Gestor</span>
          </span>
          <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
            IONEX360
          </span>
        </div>
      </div>
      <ClinicContext />
      <div className="flex-1 px-4 overflow-y-auto">
        <nav className="flex flex-col gap-1">
          {navigation.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/portal" && location.startsWith(item.href));
            return (
              <Link key={item.name} href={item.href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  aria-current={isActive ? "page" : undefined}
                  className={`w-full justify-start gap-3 ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Button>
              </Link>
            );
          })}

          {activeClinicId && (
            <>
              <div className="mt-2">
                <button
                  onClick={() => setOperacionalOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider hover:text-sidebar-foreground/70 transition-colors"
                >
                  <span>Operacional</span>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      operacionalOpen ? "rotate-180" : "",
                    )}
                  />
                </button>
                {operacionalOpen && (
                  <div className="flex flex-col gap-1">
                    {operacionalNav.map((item) => {
                      const baseHref = item.href
                        .split("/")
                        .slice(0, 3)
                        .join("/");
                      const isActive = location.startsWith(baseHref);
                      return (
                        <Link key={item.name} href={item.href}>
                          <Button
                            variant={isActive ? "secondary" : "ghost"}
                            aria-current={isActive ? "page" : undefined}
                            className={`w-full justify-start gap-3 ${
                              isActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                            }`}
                          >
                            <item.icon className="h-4 w-4" />
                            {item.name}
                          </Button>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-2">
                <button
                  onClick={() => setComplementarOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider hover:text-sidebar-foreground/70 transition-colors"
                >
                  <span>Complementar</span>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      complementarOpen ? "rotate-180" : "",
                    )}
                  />
                </button>
                {complementarOpen && (
                  <div className="flex flex-col gap-1">
                    {complementarNav.map((item) => {
                      const baseHref = item.href
                        .split("/")
                        .slice(0, 3)
                        .join("/");
                      const isActive = location.startsWith(baseHref);
                      return (
                        <Link key={item.name} href={item.href}>
                          <Button
                            variant={isActive ? "secondary" : "ghost"}
                            aria-current={isActive ? "page" : undefined}
                            className={`w-full justify-start gap-3 ${
                              isActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                            }`}
                          >
                            <item.icon className="h-4 w-4" />
                            {item.name}
                          </Button>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </nav>
      </div>
      <div className="px-4 mt-auto space-y-1">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-sidebar-foreground/70"
          onClick={() => setPrefsOpen(true)}
        >
          <Settings className="h-4 w-4" />
          Preferências
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-sidebar-foreground/70"
          onClick={async () => {
            await logout();
            navigate("/admin/login");
          }}
          data-testid="portal-logout-button"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <header className="md:hidden sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b bg-background px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="-m-2.5 p-2.5">
              <span className="sr-only">Abrir menu</span>
              <Menu className="h-6 w-6" aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-72 p-0 bg-sidebar border-r-sidebar-border"
          >
            <SidebarContent />
          </SheetContent>
        </Sheet>
        <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
          <div className="flex flex-1 items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold">Portal do Gestor</span>
            </div>
            {activeClinic && (
              <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                {activeClinic.fantasia || activeClinic.nome}
              </span>
            )}
          </div>
        </div>
      </header>

      <aside className="hidden md:flex w-64 flex-col bg-sidebar border-r border-sidebar-border shrink-0 fixed inset-y-0 z-50">
        <SidebarContent />
      </aside>

      <main className="flex-1 md:pl-64">
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <ClinicContextBanner />
          {children}
        </div>
      </main>

      <NotificationPreferencesModal
        open={prefsOpen}
        onOpenChange={setPrefsOpen}
      />
    </div>
  );
}
