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
  BarChart3,
  Wand2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useGetDashboardSummary } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { NotificationPreferencesModal } from "@/components/notification-preferences-modal";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [operacionalOpen, setOperacionalOpen] = useState(
    location.startsWith("/delegacao") || location.startsWith("/riscos") || location.startsWith("/acao")
  );
  const [complementarOpen, setComplementarOpen] = useState(
    location.startsWith("/processos") || location.startsWith("/evidencias") || location.startsWith("/documentos") || location.startsWith("/relatorios")
  );
  const [prefsOpen, setPrefsOpen] = useState(false);

  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Clínicas", href: "/admin/clinicas", icon: Building2 },
    { name: "Diagnóstico 360°", href: "/diagnostico/select", icon: ClipboardList },
    { name: "Notificações", href: "/notifications", icon: Bell },
  ];

  const operacionalNav = [
    { name: "Delegação", href: "/delegacao/select", icon: Users },
    { name: "Mapa de Riscos", href: "/riscos/select", icon: ShieldAlert },
    { name: "Plano de Ação", href: "/acao/select", icon: KanbanSquare },
  ];

  const complementarNav = [
    { name: "Processos", href: "/processos/select", icon: GitFork },
    { name: "Evidências", href: "/evidencias/select", icon: Image },
    { name: "Documentos", href: "/documentos/select", icon: FileText },
    { name: "Relatórios", href: "/relatorios/select", icon: BarChart3 },
  ];

  const SidebarContent = () => (
    <div className="flex h-full flex-col gap-4 py-4">
      <div className="px-6 py-2 flex items-center gap-2">
        <Activity className="h-6 w-6 text-primary" />
        <span className="text-xl font-bold tracking-tight text-sidebar-primary">IONEX<span className="text-sidebar-foreground">360</span></span>
      </div>
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
                  const isActive = location.startsWith(item.href.split("/select")[0]);
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
                  const isActive = location.startsWith(item.href.split("/select")[0]);
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
        </nav>
      </div>
      <div className="px-4 mt-auto space-y-1">
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
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-sidebar-foreground/70"
          onClick={() => setPrefsOpen(true)}
        >
          <Settings className="h-4 w-4" />
          Configurações
        </Button>
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
                <Activity className="h-5 w-5 text-primary" />
                <span className="text-lg font-bold">IONEX360</span>
             </div>
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

      <NotificationPreferencesModal open={prefsOpen} onOpenChange={setPrefsOpen} />
    </div>
  );
}
