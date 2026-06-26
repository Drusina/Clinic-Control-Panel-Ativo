import { Link, useLocation, useSearch } from "wouter";
import {
  Building2,
  LayoutDashboard,
  Bell,
  Settings,
  Menu,
  Users,
  ShieldAlert,
  KanbanSquare,
  ChevronDown,
  GitFork,
  Image,
  FileText,
  Wand2,
  Plug,
  LogOut,
  ShieldCheck,
  Calendar,
  Network,
  KeyRound,
  Stethoscope,
  CalendarCheck,
  Share2,
  CreditCard,
  ArrowLeft,
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
  active: boolean;
  testId?: string;
}

/**
 * Routes that ALWAYS render platform chrome for a super_admin, even when a
 * clinic is stored as "active". The two-mode shell is URL-driven: clinic mode
 * is entered only when the URL itself carries a clinic id (see
 * `clinicIdFromPath`). These platform routes never carry one.
 */
const PLATFORM_PREFIXES = [
  "/admin/ics-templates",
  "/admin/lgpd-templates",
  "/admin/configuracoes",
  "/configuracoes",
  "/notifications",
];

function isPlatformRoute(path: string): boolean {
  if (path === "/") return true;
  if (path === "/admin/clinicas" || path === "/admin/clinicas/new") return true;
  return PLATFORM_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

// Clinic-scoped URL prefixes whose `/:id` segment is the CLINIC id. Diagnostic
// routes (`/diagnostico/:id`) carry a DIAGNOSTIC id, not a clinic id, so they
// are intentionally excluded.
const CLINIC_ID_RE =
  /\/(?:admin\/clinicas|processos|evidencias|delegacao|riscos|acao|documentos|relatorios|kickoff)\/([0-9a-f][0-9a-f-]{7,})/i;

function clinicIdFromPath(path: string): string | null {
  const m = path.match(CLINIC_ID_RE);
  return m ? m[1] : null;
}

/**
 * Determine the "active clinic" for the team_member chrome (mobile header +
 * 2+ clinic switcher). Resolution order: clinic id in the URL → the
 * session-scoped active clinic → the only clinic. With 2+ clinics and no
 * explicit selection we return null so the UI never silently defaults.
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

function navBtnClass(active: boolean): string {
  return `w-full justify-start gap-3 ${
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
  }`;
}

function NavLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <Link href={item.href}>
      <Button
        variant={item.active ? "secondary" : "ghost"}
        aria-current={item.active ? "page" : undefined}
        className={navBtnClass(item.active)}
        data-testid={item.testId}
      >
        <Icon className="h-4 w-4" />
        {item.name}
      </Button>
    </Link>
  );
}

function GroupHeading({ label }: { label: string }) {
  return (
    <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
      {label}
    </div>
  );
}

function CollapsibleHeading({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground/70"
    >
      <span>{label}</span>
      <ChevronDown
        className={cn("h-3 w-3 transition-transform", open ? "rotate-180" : "")}
      />
    </button>
  );
}

function DisabledNavItem({
  icon: Icon,
  label,
}: {
  icon: typeof LayoutDashboard;
  label: string;
}) {
  return (
    <div className="flex cursor-not-allowed select-none items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/40">
      <span className="flex items-center gap-3">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      <span className="rounded bg-sidebar-accent/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
        em breve
      </span>
    </div>
  );
}

function ContextIndicator({ label }: { label: string }) {
  return (
    <div className="mx-4 flex items-center gap-2 rounded-md border border-sidebar-border/60 bg-sidebar-accent/30 px-3 py-1.5">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      <span className="truncate text-xs font-medium text-sidebar-foreground/80">
        {label}
      </span>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const { data: user } = useCurrentRole();
  const { data: myClinicsData } = useMyClinics();
  const logout = useLogout();

  const isSuperAdmin = user?.role === "super_admin";
  const isTeamMember = user?.role === "team_member";
  const myClinics = myClinicsData?.clinics ?? [];

  // Two-mode (super_admin) state — purely URL-driven.
  const urlClinicId = clinicIdFromPath(location);
  const platformRoute = isPlatformRoute(location);
  const clinicMode = isSuperAdmin && !platformRoute && !!urlClinicId;
  const clinicModeClinic = useMemo(
    () => myClinics.find((c) => c.id === urlClinicId) ?? null,
    [myClinics, urlClinicId],
  );

  // team_member chrome (unchanged): mobile header + 2+ switcher.
  const activeClinicId = useMemo(
    () => resolveActiveClinicId(location, myClinics.map((c) => c.id)),
    [location, myClinics],
  );
  const activeClinic = myClinics.find((c) => c.id === activeClinicId) ?? null;

  // Current tab / aba inside the clinic-detail shell (for clinic-mode nav).
  const sp = new URLSearchParams(search);
  const currentTab = sp.get("tab");
  const currentAba = sp.get("aba");

  const [modelosOpen, setModelosOpen] = useState(
    location.startsWith("/admin/ics-templates") ||
      location.startsWith("/admin/lgpd-templates"),
  );

  const logoutTo = isSuperAdmin ? "/admin/login" : "/entrar";
  const handleLogout = async () => {
    await logout();
    navigate(logoutTo);
  };

  // ── Nav models ────────────────────────────────────────────────────────────
  const clinicBase = `/admin/clinicas/${urlClinicId}`;
  const tabHref = (tab: string, aba?: string) =>
    aba ? `${clinicBase}?tab=${tab}&aba=${aba}` : `${clinicBase}?tab=${tab}`;
  const isClinicDetail = location === clinicBase;
  const tabActive = (tab: string) =>
    isClinicDetail && currentTab === tab && currentAba !== "delegacao";

  const platformNav: NavItem[] = [
    {
      name: "Painel",
      href: "/",
      icon: LayoutDashboard,
      active: location === "/",
      testId: "nav-painel",
    },
    {
      name: "Clínicas",
      href: "/admin/clinicas",
      icon: Building2,
      active: location.startsWith("/admin/clinicas"),
      testId: "nav-clinicas",
    },
    {
      name: "Notificações",
      href: "/notifications",
      icon: Bell,
      active: location.startsWith("/notifications"),
      testId: "nav-notificacoes",
    },
  ];

  const modelosNav: NavItem[] = [
    {
      name: "Templates ICS",
      href: "/admin/ics-templates",
      icon: Wand2,
      active: location.startsWith("/admin/ics-templates"),
      testId: "nav-ics-templates",
    },
    {
      name: "Templates LGPD",
      href: "/admin/lgpd-templates",
      icon: ShieldCheck,
      active: location.startsWith("/admin/lgpd-templates"),
      testId: "nav-lgpd-templates",
    },
  ];

  const adminNav: NavItem[] = [
    {
      name: "Integrações",
      href: "/admin/configuracoes",
      icon: Plug,
      active: location.startsWith("/admin/configuracoes"),
      testId: "nav-integracoes",
    },
    {
      name: "Configurações",
      href: "/configuracoes",
      icon: Settings,
      active: location.startsWith("/configuracoes"),
      testId: "nav-configuracoes",
    },
  ];

  const onboardingNav: NavItem[] = [
    { name: "Agenda", href: tabHref("agenda"), icon: Calendar, active: tabActive("agenda") },
    { name: "Equipe interna", href: tabHref("team"), icon: Users, active: tabActive("team") },
    { name: "Equipe externa", href: tabHref("rede-externa"), icon: Network, active: tabActive("rede-externa") },
    { name: "Sistemas e acessos", href: tabHref("sistemas-acessos"), icon: KeyRound, active: tabActive("sistemas-acessos") },
  ];

  const operacaoNav: NavItem[] = [
    { name: "Diagnóstico", href: tabHref("diagnostics"), icon: Stethoscope, active: tabActive("diagnostics") },
    { name: "Mapa de riscos", href: tabHref("risks"), icon: ShieldAlert, active: tabActive("risks") },
    { name: "Plano de ação", href: tabHref("actions"), icon: KanbanSquare, active: tabActive("actions") },
    { name: "Processos", href: `/processos/${urlClinicId}`, icon: GitFork, active: location.startsWith("/processos/") },
  ];

  const conducaoNav: NavItem[] = [
    { name: "Reuniões", href: tabHref("reunioes"), icon: CalendarCheck, active: tabActive("reunioes") },
    {
      name: "Delegações",
      href: tabHref("diagnostics", "delegacao"),
      icon: Share2,
      active: isClinicDetail && currentTab === "diagnostics" && currentAba === "delegacao",
    },
  ];

  const documentacaoNav: NavItem[] = [
    { name: "Documentos", href: tabHref("documentos"), icon: FileText, active: tabActive("documentos") },
    { name: "Evidências", href: `/evidencias/${urlClinicId}`, icon: Image, active: location.startsWith("/evidencias/") },
  ];

  const SairButton = () => (
    <Button
      variant="ghost"
      className="w-full justify-start gap-3 text-sidebar-foreground/70"
      onClick={handleLogout}
      data-testid="logout-button"
    >
      <LogOut className="h-4 w-4" />
      Sair
    </Button>
  );

  // ── Sidebar variants ──────────────────────────────────────────────────────
  const TeamMemberSidebar = () => (
    <>
      {myClinics.length >= 2 && (
        <div className="px-4 pb-2">
          <GlobalClinicSwitcher
            clinics={myClinics}
            activeClinicId={activeClinicId}
            variant="sidebar"
            triggerTestId="clinic-switcher-trigger"
            onPick={(id) => {
              setActiveClinicId(id);
              navigate(rerouteForClinic(location, id) ?? `/portal/clinica/${id}`);
            }}
          />
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4">
        <nav className="flex flex-col gap-1">
          <NavLink
            item={{
              name: "Minhas clínicas",
              href: "/me/clinicas",
              icon: Building2,
              active: location.startsWith("/me/clinicas"),
            }}
          />
        </nav>
      </div>
      <div className="mt-auto space-y-1 px-4">
        <NavLink
          item={{
            name: "Configurações",
            href: "/configuracoes",
            icon: Settings,
            active: location.startsWith("/configuracoes"),
          }}
        />
        <SairButton />
      </div>
    </>
  );

  const PlatformSidebar = () => (
    <>
      <ContextIndicator label="Plataforma" />
      <div className="flex-1 overflow-y-auto px-4">
        <nav className="flex flex-col gap-1">
          <GroupHeading label="Plataforma" />
          {platformNav.map((item) => (
            <NavLink key={item.name} item={item} />
          ))}

          <GroupHeading label="Administração" />
          <CollapsibleHeading
            label="Modelos"
            open={modelosOpen}
            onToggle={() => setModelosOpen((o) => !o)}
          />
          {modelosOpen && (
            <div className="flex flex-col gap-1">
              {modelosNav.map((item) => (
                <NavLink key={item.name} item={item} />
              ))}
            </div>
          )}
          {adminNav.map((item) => (
            <NavLink key={item.name} item={item} />
          ))}

          <GroupHeading label="Em breve" />
          <DisabledNavItem icon={CreditCard} label="Planos" />
          <DisabledNavItem icon={Users} label="Equipe IONEX" />
        </nav>
      </div>
      <div className="mt-auto space-y-1 px-4">
        <SairButton />
      </div>
    </>
  );

  const ClinicSidebar = () => {
    const groups: { label: string; items: NavItem[] }[] = [
      { label: "Onboarding", items: onboardingNav },
      { label: "Operação", items: operacaoNav },
      { label: "Condução", items: conducaoNav },
      { label: "Documentação", items: documentacaoNav },
    ];
    return (
      <>
        <ContextIndicator
          label={clinicModeClinic?.fantasia || clinicModeClinic?.nome || "Clínica"}
        />
        <div className="flex-1 overflow-y-auto px-4">
          <nav className="flex flex-col gap-1">
            {groups.map((g) => (
              <div key={g.label}>
                <GroupHeading label={g.label} />
                {g.items.map((item) => (
                  <NavLink key={item.name} item={item} />
                ))}
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-auto space-y-1 px-4">
          <SairButton />
        </div>
      </>
    );
  };

  const SidebarContent = () => (
    <div className="flex h-full flex-col gap-3 py-4">
      <div className="flex items-center px-6 py-2">
        <Brand className="text-xl" />
      </div>
      {isTeamMember && <TeamMemberSidebar />}
      {isSuperAdmin && (clinicMode ? <ClinicSidebar /> : <PlatformSidebar />)}
    </div>
  );

  const ClinicBanner = () => {
    if (!clinicMode) return null;
    const name = clinicModeClinic?.fantasia || clinicModeClinic?.nome || "Clínica";
    return (
      <div
        className="sticky top-16 z-30 flex flex-col gap-2 border-b bg-card/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:flex-row sm:items-center sm:justify-between md:top-0"
        data-testid="clinic-context-banner"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm">
            Você está em: <strong>{name}</strong>
          </span>
          <span className="hidden text-xs text-muted-foreground lg:inline">
            • somente os dados desta clínica
          </span>
        </div>
        <div className="flex items-center gap-2">
          <GlobalClinicSwitcher
            clinics={myClinics}
            activeClinicId={urlClinicId}
            variant="sidebar"
            placeholder="Trocar de clínica"
            triggerTestId="clinic-switcher-trigger"
            onPick={(id) => {
              setActiveClinicId(id);
              navigate(
                rerouteForClinic(location, id) ?? `/admin/clinicas/${id}?tab=overview`,
              );
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-2 whitespace-nowrap"
            onClick={() => navigate("/")}
            data-testid="exit-to-platform"
          >
            <ArrowLeft className="h-4 w-4" />
            Sair para a plataforma
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      {/* Mobile Header */}
      <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b bg-background px-4 shadow-sm sm:gap-x-6 sm:px-6 md:hidden lg:px-8">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="-m-2.5 p-2.5">
              <span className="sr-only">Abrir menu</span>
              <Menu className="h-6 w-6" aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-72 border-r-sidebar-border bg-sidebar p-0"
          >
            <SidebarContent />
          </SheetContent>
        </Sheet>
        <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
          <div className="flex flex-1 items-center justify-between">
            <div className="flex items-center gap-2">
              <Brand className="text-lg" />
            </div>
            {isTeamMember && activeClinic && (
              <span className="max-w-[140px] truncate text-xs text-muted-foreground">
                {activeClinic.fantasia || activeClinic.nome}
              </span>
            )}
            {clinicMode && clinicModeClinic && (
              <span className="max-w-[140px] truncate text-xs text-muted-foreground">
                {clinicModeClinic.fantasia || clinicModeClinic.nome}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 z-50 hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:pl-64">
        <ClinicBanner />
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
