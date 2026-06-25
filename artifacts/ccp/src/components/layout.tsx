import { Link, useLocation } from "wouter";
import {
  Building2,
  LayoutDashboard,
  Bell,
  Settings,
  Menu,
  ClipboardList,
  Users,
  ShieldAlert,
  KanbanSquare,
  ChevronDown,
  GitFork,
  Image,
  FileText,
  BarChart3,
  Wand2,
  Plug,
  LogOut,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { GlobalClinicSwitcher } from "@/components/global-clinic-switcher";
import { rerouteForClinic } from "@/lib/clinic-routing";
import {
  useCurrentRole,
  useMyClinics,
  useLogout,
  getActiveClinicId,
  setActiveClinicId,
} from "@/hooks/use-auth";

interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
}

/**
 * Determine the "active clinic" for routing context-aware nav items
 * (e.g. /delegacao/select → /delegacao/<activeClinic>). Resolution
 * order:
 *   1. Clinic id present in the current URL (from /xxx/<id>)
 *   2. The session-scoped active clinic (getActiveClinicId / sessionStorage)
 *   3. The only clinic, when the user has exactly one
 *
 * Clinic-first: with 2+ clinics and no explicit selection we return null
 * so the UI never silently defaults to the first clinic — that default
 * could surface the wrong clinic during a client-facing session. Mirrors
 * the same guarantee in PortalLayout.
 */
function resolveActiveClinicId(
  location: string,
  myClinicIds: string[],
): string | null {
  const urlMatch = location.match(/\/[a-z]+\/([a-f0-9-]{8,})/i);
  if (urlMatch && myClinicIds.includes(urlMatch[1])) return urlMatch[1];
  const stored = getActiveClinicId();
  if (stored && myClinicIds.includes(stored)) return stored;
  return myClinicIds.length === 1 ? myClinicIds[0] : null;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [operacionalOpen, setOperacionalOpen] = useState(
    location.startsWith("/delegacao") || location.startsWith("/riscos") || location.startsWith("/acao")
  );
  const [complementarOpen, setComplementarOpen] = useState(
    location.startsWith("/processos") || location.startsWith("/evidencias") || location.startsWith("/documentos") || location.startsWith("/relatorios")
  );

  const { data: user } = useCurrentRole();
  const { data: myClinicsData } = useMyClinics();
  const logout = useLogout();

  const isSuperAdmin = user?.role === "super_admin";
  const isTeamMember = user?.role === "team_member";
  const myClinics = myClinicsData?.clinics ?? [];

  const activeClinicId = useMemo(
    () => resolveActiveClinicId(location, myClinics.map((c) => c.id)),
    [location, myClinics],
  );
  const activeClinic = myClinics.find((c) => c.id === activeClinicId) ?? null;

  // For team members, point clinic-scoped /select links straight at the
  // active clinic so a single-click flow is preserved.
  const scopedHref = (base: string, selectPath: string): string => {
    if (isSuperAdmin || !activeClinicId) return selectPath;
    return `${base}/${activeClinicId}`;
  };

  const navigation: NavItem[] = isSuperAdmin
    ? [
        { name: "Dashboard", href: "/", icon: LayoutDashboard },
        { name: "Clínicas", href: "/admin/clinicas", icon: Building2 },
        { name: "Diagnóstico 360°", href: "/diagnostico/select", icon: ClipboardList },
        { name: "Notificações", href: "/notifications", icon: Bell },
      ]
    : [
        // team_member only ever sees the AppLayout chrome on the
        // /me/clinicas chooser — TeamMemberToPortal bounces them off every
        // other AppLayout route into the dedicated /portal namespace. So the
        // manager's sidebar here is just the clinic-chooser entry; the
        // operational modules live in PortalLayout, scoped to a clinic.
        { name: "Minhas clínicas", href: "/me/clinicas", icon: Building2 },
      ];

  const operacionalNav: NavItem[] = [
    { name: "Delegação", href: scopedHref("/delegacao", "/delegacao/select"), icon: Users },
    { name: "Mapa de Riscos", href: scopedHref("/riscos", "/riscos/select"), icon: ShieldAlert },
    { name: "Plano de Ação", href: scopedHref("/acao", "/acao/select"), icon: KanbanSquare },
  ];

  const complementarNav: NavItem[] = [
    { name: "Processos", href: scopedHref("/processos", "/processos/select"), icon: GitFork },
    { name: "Evidências", href: scopedHref("/evidencias", "/evidencias/select"), icon: Image },
    { name: "Documentos", href: scopedHref("/documentos", "/documentos/select"), icon: FileText },
    { name: "Relatórios", href: scopedHref("/relatorios", "/relatorios/select"), icon: BarChart3 },
  ];

  // Operational/Complementar module sections belong to the super-admin
  // sidebar only. A team_member never legitimately stays on an AppLayout
  // module route (TeamMemberToPortal redirects them to /portal), so showing
  // these here only ever leaked the modules onto the /me/clinicas chooser.
  const showOperationalSections = isSuperAdmin;

  // Global, persistent clinic switcher. Visible to super_admin (jump between
  // any clinic, staying in the same module) and to a 2+ gestor. Picking a
  // clinic is always explicit, so the clinic-first isolation invariant holds.
  const ClinicSwitcher = () => {
    const show = isSuperAdmin ? myClinics.length >= 1 : myClinics.length >= 2;
    if (!show) return null;
    return (
      <div className="px-4 pb-2">
        <GlobalClinicSwitcher
          clinics={myClinics}
          activeClinicId={activeClinicId}
          variant="sidebar"
          triggerTestId="clinic-switcher-trigger"
          onPick={(id) => {
            setActiveClinicId(id);
            navigate(
              rerouteForClinic(location, id) ??
                (isSuperAdmin
                  ? `/admin/clinicas/${id}`
                  : `/portal/clinica/${id}`),
            );
          }}
        />
      </div>
    );
  };

  const SidebarContent = () => (
    <div className="flex h-full flex-col gap-4 py-4">
      <div className="px-6 py-2 flex items-center">
        <Brand className="text-xl" />
      </div>
      <ClinicSwitcher />
      <div className="flex-1 px-4 overflow-y-auto">
        <nav className="flex flex-col gap-1">
          {navigation.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href.split("/select")[0]));
            return (
              <Link key={item.name} href={item.href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  aria-current={isActive ? "page" : undefined}
                  className={`w-full justify-start gap-3 ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"}`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Button>
              </Link>
            );
          })}

          {showOperationalSections && (
            <>
              <div className="mt-2">
                <button
                  onClick={() => setOperacionalOpen(o => !o)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider hover:text-sidebar-foreground/70 transition-colors"
                >
                  <span>Operacional</span>
                  <ChevronDown className={cn("h-3 w-3 transition-transform", operacionalOpen ? "rotate-180" : "")} />
                </button>
                {operacionalOpen && (
                  <div className="flex flex-col gap-1">
                    {operacionalNav.map((item) => {
                      const baseHref = item.href.split("/select")[0].split("/").slice(0, 2).join("/");
                      const isActive = location.startsWith(baseHref);
                      return (
                        <Link key={item.name} href={item.href}>
                          <Button
                            variant={isActive ? "secondary" : "ghost"}
                            aria-current={isActive ? "page" : undefined}
                            className={`w-full justify-start gap-3 ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"}`}
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
                  onClick={() => setComplementarOpen(o => !o)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider hover:text-sidebar-foreground/70 transition-colors"
                >
                  <span>Complementar</span>
                  <ChevronDown className={cn("h-3 w-3 transition-transform", complementarOpen ? "rotate-180" : "")} />
                </button>
                {complementarOpen && (
                  <div className="flex flex-col gap-1">
                    {complementarNav.map((item) => {
                      const baseHref = item.href.split("/select")[0].split("/").slice(0, 2).join("/");
                      const isActive = location.startsWith(baseHref);
                      return (
                        <Link key={item.name} href={item.href}>
                          <Button
                            variant={isActive ? "secondary" : "ghost"}
                            aria-current={isActive ? "page" : undefined}
                            className={`w-full justify-start gap-3 ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"}`}
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
        {isSuperAdmin && (
          <>
            <Link href="/admin/ics-templates">
              <Button
                variant={location.startsWith("/admin/ics-templates") ? "secondary" : "ghost"}
                aria-current={location.startsWith("/admin/ics-templates") ? "page" : undefined}
                className={`w-full justify-start gap-3 ${location.startsWith("/admin/ics-templates") ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"}`}
              >
                <Wand2 className="h-4 w-4" />
                Templates ICS
              </Button>
            </Link>
            <Link href="/admin/configuracoes">
              <Button
                variant={location.startsWith("/admin/configuracoes") ? "secondary" : "ghost"}
                aria-current={location.startsWith("/admin/configuracoes") ? "page" : undefined}
                className={`w-full justify-start gap-3 ${location.startsWith("/admin/configuracoes") ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"}`}
              >
                <Plug className="h-4 w-4" />
                Integrações
              </Button>
            </Link>
          </>
        )}
        <Link href="/configuracoes">
          <Button
            variant={location.startsWith("/configuracoes") ? "secondary" : "ghost"}
            aria-current={location.startsWith("/configuracoes") ? "page" : undefined}
            className={`w-full justify-start gap-3 ${location.startsWith("/configuracoes") ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"}`}
          >
            <Settings className="h-4 w-4" />
            Configurações
          </Button>
        </Link>
        {(isSuperAdmin || isTeamMember) && (
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-sidebar-foreground/70"
            onClick={async () => {
              await logout();
              navigate(isSuperAdmin ? "/admin/login" : "/entrar");
            }}
            data-testid="logout-button"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b bg-background px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="-m-2.5 p-2.5">
              <span className="sr-only">Abrir menu</span>
              <Menu className="h-6 w-6" aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 bg-sidebar border-r-sidebar-border">
            <SidebarContent />
          </SheetContent>
        </Sheet>
        <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
          <div className="flex flex-1 items-center justify-between">
             <div className="flex items-center gap-2">
                <Brand className="text-lg" />
             </div>
             {isTeamMember && activeClinic && (
               <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                 {activeClinic.fantasia || activeClinic.nome}
               </span>
             )}
          </div>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar border-r border-sidebar-border shrink-0 fixed inset-y-0 z-50">
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:pl-64">
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
