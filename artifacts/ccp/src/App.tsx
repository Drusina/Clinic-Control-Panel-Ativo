import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout";
import { PortalLayout } from "@/components/portal-layout";
import Dashboard from "@/pages/dashboard";
import Clinics from "@/pages/clinics/index";
import NewClinic from "@/pages/clinics/new";
import EditClinic from "@/pages/clinics/edit";
import ClinicDetail from "@/pages/clinics/detail";
import Notifications from "@/pages/notifications/index";
import AdminLogin from "@/pages/admin-login";
import EntrarPage from "@/pages/entrar";
import TrocarSenhaPage from "@/pages/trocar-senha";
import EsqueciSenhaPage from "@/pages/esqueci-senha";
import RedefinirSenhaPage from "@/pages/redefinir-senha";
import KickoffPage from "@/pages/kickoff/index";
import KickoffSelectPage from "@/pages/kickoff/select";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { ClinicAccessGuard } from "@/components/clinic-access-guard";
import { TeamMemberToPortal } from "@/components/role-redirect";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { getStoredToken, getActiveClinicId, useMyClinics, useCurrentRole } from "@/hooks/use-auth";
import DiagnosticoSelectPage from "@/pages/diagnostico/select";
import DiagnosticoWizard from "@/pages/diagnostico/wizard";
import DiagnosticoResultado from "@/pages/diagnostico/resultado";
import DiagnosticoComparar from "@/pages/diagnostico/comparar";
import DelegacaoPage from "@/pages/delegacao/index";
import RiscosPage from "@/pages/riscos/index";
import AcaoPage from "@/pages/acao/index";
import ProcessosPage from "@/pages/processos/index";
import EvidenciasPage from "@/pages/evidencias/index";
import DocumentosPage from "@/pages/documentos/index";
import RelatoriosPage from "@/pages/relatorios/index";
import IcsTemplatesPage from "@/pages/ics-templates/index";
import AdminConfiguracoesPage from "@/pages/admin-configuracoes/index";
import ConvitePage from "@/pages/convite/index";
import ResponderEntrypoint from "@/pages/responder/index";
import ResponderWizard from "@/pages/responder/wizard";
import ResponderSaiuPage from "@/pages/responder/saiu";
import ClinicDocumentsPage from "@/pages/clinic-documents/index";
import AssinarPage from "@/pages/assinar/index";
import MeClinicasPage from "@/pages/me/clinicas";
import PainelClinica from "@/pages/portal/painel-clinica";
import { ErrorBoundary } from "@/components/error-boundary";
import { Loader2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchLatestActive() {
  const token = getStoredToken();
  if (!token) return null;
  const res = await fetch(`${BASE}/api/diagnostics/latest-active`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

function DiagnosticoEntrypoint() {
  const [location, navigate] = useLocation();
  const isPortal = location.startsWith("/portal");
  const pilarParam = new URLSearchParams(window.location.search).get("pilar");

  const { data, isLoading } = useQuery({
    queryKey: ["diagnostico-latest-active"],
    queryFn: fetchLatestActive,
    retry: false,
    // In the portal we always route through the active-clinic-scoped
    // selector, so the cross-clinic latest-active lookup is unnecessary.
    enabled: !isPortal,
  });

  useEffect(() => {
    const pilarQuery = pilarParam ? `?pilar=${encodeURIComponent(pilarParam)}` : "";
    // Portal (team_member): never jump straight into a diagnostic resolved
    // across all clinics — `latest-active` is not active-clinic-scoped and
    // could open a NON-active clinic's wizard, breaking the clinic-first
    // guarantee. Always go through the active-clinic-scoped selector, which
    // itself redirects to /me/clinicas when no clinic is selected.
    if (isPortal) {
      navigate(`/portal/diagnostico/select${pilarQuery}`, { replace: true });
      return;
    }
    if (isLoading) return;
    if (data?.id) {
      navigate(`/diagnostico/${data.id}${pilarQuery}`, { replace: true });
    } else {
      navigate(`/diagnostico/select${pilarQuery}`, { replace: true });
    }
  }, [isPortal, isLoading, data, navigate, pilarParam]);

  return null;
}

/**
 * Resolves the active clinic and redirects to `${basePath}/${clinicId}`.
 * Used by `/portal/<module>` shortcut routes so the manager doesn't have
 * to type/keep a clinic id in the URL.
 */
function PortalActiveRedirect({
  basePath,
  secao,
}: {
  basePath: string;
  secao?: string;
}) {
  const { data: my, isLoading } = useMyClinics();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  const clinics = my?.clinics ?? [];
  const stored = getActiveClinicId();
  const validStored =
    stored && clinics.some((c) => c.id === stored) ? stored : null;
  // Single-clinic managers resolve straight to their only clinic. With 2+
  // clinics and no valid active selection we send them to the chooser
  // instead of silently defaulting to the first clinic — that default could
  // surface the wrong clinic's data during a client-facing session.
  const id = validStored ?? (clinics.length === 1 ? clinics[0]?.id ?? null : null);
  if (!id) return <Redirect to="/me/clinicas" />;
  const suffix = secao ? `/${secao}` : "";
  return <Redirect to={`${basePath}/${id}${suffix}`} />;
}

setAuthTokenGetter(getStoredToken);

const queryClient = new QueryClient();

/**
 * Quando o team_member está com senha provisória, força redirecionamento
 * para /trocar-senha (exceto se já estiver lá ou em telas públicas). Isso
 * impede acesso ao app antes da troca de senha mesmo se ele navegar
 * manualmente para qualquer URL interna.
 */
function ProvisionalPasswordGate({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const me = useCurrentRole();

  const isAllowedWithoutSenha =
    location === "/trocar-senha" ||
    location === "/entrar" ||
    location === "/esqueci-senha" ||
    location === "/redefinir-senha" ||
    location === "/admin/login" ||
    location.startsWith("/convite") ||
    location.startsWith("/assinar/") ||
    location.startsWith("/responder");

  useEffect(() => {
    if (me.isLoading) return;
    if (me.data?.role !== "team_member") return;
    if (me.data?.senhaProvisoria === true && !isAllowedWithoutSenha) {
      // Preserva o destino original (path + querystring) para que após a
      // troca de senha o usuário volte exatamente onde tentou ir.
      const search = typeof window !== "undefined" ? window.location.search : "";
      const next = encodeURIComponent(`${location}${search}`);
      navigate(`/trocar-senha?next=${next}`, { replace: true });
    }
  }, [me.isLoading, me.data?.role, me.data?.senhaProvisoria, isAllowedWithoutSenha, navigate, location]);

  return <>{children}</>;
}

export function Router() {
  return (
    <ProvisionalPasswordGate>
    <Switch>
      <Route path="/admin/login" component={AdminLogin} />

      {/* Public electronic-signature page — no auth, no AppLayout. */}
      <Route path="/assinar/:token" component={AssinarPage} />

      <Route path="/convite" component={ConvitePage} />

      {/* Login fixo por senha (task #216). */}
      <Route path="/entrar" component={EntrarPage} />
      <Route path="/esqueci-senha" component={EsqueciSenhaPage} />
      <Route path="/redefinir-senha" component={RedefinirSenhaPage} />
      <Route path="/trocar-senha" component={TrocarSenhaPage} />

      {/* Public per-pilar respondent flow (no AppLayout, no auth gate). */}
      <Route path="/responder" component={ResponderEntrypoint} />
      <Route path="/responder/wizard" component={ResponderWizard} />
      <Route path="/responder/saiu" component={ResponderSaiuPage} />

      {/* Multi-clinic chooser for team members (post-login landing). */}
      <Route path="/me/clinicas">
        {() => (
          <AppLayout>
            <MeClinicasPage />
          </AppLayout>
        )}
      </Route>

      {/* ─── Portal do Gestor (team_member) — unified Painel da Clínica ─── */}
      {/* Entry points resolve the active clinic, then land in the panel. */}
      <Route path="/portal">
        {() => <PortalActiveRedirect basePath="/portal/clinica" />}
      </Route>
      <Route path="/portal/clinica">
        {() => <PortalActiveRedirect basePath="/portal/clinica" />}
      </Route>
      <Route path="/portal/kickoff">
        {() => <PortalActiveRedirect basePath="/portal/clinica" secao="kickoff" />}
      </Route>
      <Route path="/portal/kickoff/:clinicId">
        {(params) => <Redirect to={`/portal/clinica/${params.clinicId}/kickoff`} />}
      </Route>
      <Route path="/portal/notificacoes">
        {() => (
          <PortalLayout>
            <ClinicAccessGuard>
              <Notifications />
            </ClinicAccessGuard>
          </PortalLayout>
        )}
      </Route>
      {/* Alias: spec lists `/portal/notifications` (en); we accept both. */}
      <Route path="/portal/notifications">
        {() => <Redirect to="/portal/notificacoes" />}
      </Route>
      <Route path="/portal/equipe">
        {() => <PortalActiveRedirect basePath="/portal/clinica" secao="equipe" />}
      </Route>
      <Route path="/portal/equipe/:clinicId">
        {(params) => <Redirect to={`/portal/clinica/${params.clinicId}/equipe`} />}
      </Route>
      <Route path="/portal/rede-externa">
        {() => <PortalActiveRedirect basePath="/portal/clinica" secao="rede-externa" />}
      </Route>
      <Route path="/portal/rede-externa/:clinicId">
        {(params) => <Redirect to={`/portal/clinica/${params.clinicId}/rede-externa`} />}
      </Route>
      <Route path="/portal/diagnostico">
        {() => (
          <PortalLayout>
            <ClinicAccessGuard>
              <DiagnosticoEntrypoint />
            </ClinicAccessGuard>
          </PortalLayout>
        )}
      </Route>
      <Route path="/portal/diagnostico/select">
        {() => (
          <PortalLayout>
            <ClinicAccessGuard>
              <DiagnosticoSelectPage />
            </ClinicAccessGuard>
          </PortalLayout>
        )}
      </Route>
      <Route path="/portal/diagnostico/comparar">
        {() => (
          <PortalLayout>
            <ClinicAccessGuard>
              <DiagnosticoComparar />
            </ClinicAccessGuard>
          </PortalLayout>
        )}
      </Route>
      <Route path="/portal/diagnostico/:id/resultado">
        {() => (
          <PortalLayout>
            <ClinicAccessGuard>
              <DiagnosticoResultado />
            </ClinicAccessGuard>
          </PortalLayout>
        )}
      </Route>
      <Route path="/portal/diagnostico/:id">
        {() => (
          <PortalLayout>
            <ClinicAccessGuard>
              <DiagnosticoWizard />
            </ClinicAccessGuard>
          </PortalLayout>
        )}
      </Route>
      <Route path="/portal/delegacao">
        {() => <PortalActiveRedirect basePath="/portal/clinica" secao="delegacao" />}
      </Route>
      <Route path="/portal/delegacao/:clinicId">
        {(params) => <Redirect to={`/portal/clinica/${params.clinicId}/delegacao`} />}
      </Route>
      <Route path="/portal/riscos">
        {() => <PortalActiveRedirect basePath="/portal/clinica" secao="riscos" />}
      </Route>
      <Route path="/portal/riscos/:clinicId">
        {(params) => <Redirect to={`/portal/clinica/${params.clinicId}/riscos`} />}
      </Route>
      <Route path="/portal/acao">
        {() => <PortalActiveRedirect basePath="/portal/clinica" secao="acao" />}
      </Route>
      <Route path="/portal/acao/:clinicId">
        {(params) => <Redirect to={`/portal/clinica/${params.clinicId}/acao`} />}
      </Route>
      <Route path="/portal/processos">
        {() => <PortalActiveRedirect basePath="/portal/clinica" secao="processos" />}
      </Route>
      <Route path="/portal/processos/:clinicId">
        {(params) => <Redirect to={`/portal/clinica/${params.clinicId}/processos`} />}
      </Route>
      <Route path="/portal/evidencias">
        {() => <PortalActiveRedirect basePath="/portal/clinica" secao="evidencias" />}
      </Route>
      <Route path="/portal/evidencias/:clinicId">
        {(params) => <Redirect to={`/portal/clinica/${params.clinicId}/evidencias`} />}
      </Route>
      <Route path="/portal/documentos">
        {() => <PortalActiveRedirect basePath="/portal/clinica" secao="documentos" />}
      </Route>
      <Route path="/portal/documentos/:clinicId">
        {(params) => <Redirect to={`/portal/clinica/${params.clinicId}/documentos`} />}
      </Route>

      {/* Canonical unified panel. Two routes (with/without section) so we
          don't depend on wouter optional-param support; both render the
          PainelClinica shell which maps `:secao` to the right module. */}
      <Route path="/portal/clinica/:clinicId/:secao">
        {(params) => (
          <PortalLayout>
            <ClinicAccessGuard clinicId={params.clinicId}>
              <PainelClinica />
            </ClinicAccessGuard>
          </PortalLayout>
        )}
      </Route>
      <Route path="/portal/clinica/:clinicId">
        {(params) => (
          <PortalLayout>
            <ClinicAccessGuard clinicId={params.clinicId}>
              <PainelClinica />
            </ClinicAccessGuard>
          </PortalLayout>
        )}
      </Route>

      {/* ─── Super-admin namespace (team_member is bounced to /portal) ─── */}

      {/* Dashboard (super admin only). */}
      <Route path="/">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <Dashboard />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>

      {/* Global clinics list — super admin only. */}
      <Route path="/admin/clinicas">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <Clinics />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>
      <Route path="/admin/clinicas/new">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <NewClinic />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>
      <Route path="/admin/clinicas/:id/editar">
        {(params) => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard clinicId={params.id}>
                <EditClinic />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>
      <Route path="/admin/clinicas/:id/documentos">
        {(params) => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard clinicId={params.id}>
                <ClinicDocumentsPage />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>
      <Route path="/admin/clinicas/:id">
        {(params) => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard clinicId={params.id}>
                <ClinicDetail />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>

      <Route path="/clinics">
        <Redirect to="/admin/clinicas" />
      </Route>
      <Route path="/clinics/new">
        <Redirect to="/admin/clinicas/new" />
      </Route>
      <Route path="/clinics/:id">
        {(params) => <Redirect to={`/admin/clinicas/${params.id}`} />}
      </Route>

      {/* Notifications: any authenticated session. Team_member is bounced to
          the portal version (same component, different chrome). */}
      <Route path="/notifications">
        {() => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard>
                <Notifications />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>

      <Route path="/kickoff">
        <Redirect to="/kickoff/select" />
      </Route>
      <Route path="/kickoff/select">
        <AppLayout>
          <TeamMemberToPortal>
            <ClinicAccessGuard>
              <KickoffSelectPage />
            </ClinicAccessGuard>
          </TeamMemberToPortal>
        </AppLayout>
      </Route>
      <Route path="/kickoff/:clinicId">
        {(params) => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard clinicId={params.clinicId}>
                <KickoffPage />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>

      {/* Diagnóstico: routes carry diagnostic id (NOT clinic id). The backend
          resolves the clinic from the diagnostic id and authorises inline.
          The guard here only verifies the session is authenticated. */}
      <Route path="/diagnostico">
        {() => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard>
                <DiagnosticoEntrypoint />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>
      <Route path="/diagnostico/select">
        {() => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard>
                <DiagnosticoSelectPage />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>
      <Route path="/diagnostico/comparar">
        {() => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard>
                <DiagnosticoComparar />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>
      <Route path="/diagnostico/:id/resultado">
        {() => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard>
                <DiagnosticoResultado />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>
      <Route path="/diagnostico/:id">
        {() => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard>
                <DiagnosticoWizard />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>

      <Route path="/delegacao">
        <Redirect to="/delegacao/select" />
      </Route>
      <Route path="/delegacao/select">
        {() => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard>
                <DelegacaoPage />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>
      <Route path="/delegacao/:clinicId">
        {(params) => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard clinicId={params.clinicId}>
                <DelegacaoPage />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>

      <Route path="/riscos">
        <Redirect to="/riscos/select" />
      </Route>
      <Route path="/riscos/select">
        {() => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard>
                <RiscosPage />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>
      <Route path="/riscos/:clinicId">
        {(params) => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard clinicId={params.clinicId}>
                <RiscosPage />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>

      <Route path="/acao">
        <Redirect to="/acao/select" />
      </Route>
      <Route path="/acao/select">
        {() => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard>
                <AcaoPage />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>
      <Route path="/acao/:clinicId">
        {(params) => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard clinicId={params.clinicId}>
                <AcaoPage />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>

      <Route path="/processos">
        <Redirect to="/processos/select" />
      </Route>
      <Route path="/processos/select">
        {() => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard>
                <ProcessosPage />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>
      <Route path="/processos/:clinicId">
        {(params) => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard clinicId={params.clinicId}>
                <ProcessosPage />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>

      <Route path="/evidencias">
        <Redirect to="/evidencias/select" />
      </Route>
      <Route path="/evidencias/select">
        {() => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard>
                <EvidenciasPage />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>
      <Route path="/evidencias/:clinicId">
        {(params) => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard clinicId={params.clinicId}>
                <EvidenciasPage />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>

      <Route path="/documentos">
        <Redirect to="/documentos/select" />
      </Route>
      <Route path="/documentos/select">
        {() => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard>
                <DocumentosPage />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>
      <Route path="/documentos/:clinicId">
        {(params) => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard clinicId={params.clinicId}>
                <DocumentosPage />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>

      <Route path="/relatorios">
        <Redirect to="/relatorios/select" />
      </Route>
      <Route path="/relatorios/select">
        {() => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard>
                <RelatoriosPage />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>
      <Route path="/relatorios/:clinicId">
        {(params) => (
          <AppLayout>
            <TeamMemberToPortal>
              <ClinicAccessGuard clinicId={params.clinicId}>
                <RelatoriosPage />
              </ClinicAccessGuard>
            </TeamMemberToPortal>
          </AppLayout>
        )}
      </Route>

      {/* Global super-admin only configuration. */}
      <Route path="/admin/ics-templates">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <IcsTemplatesPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>

      <Route path="/admin/configuracoes">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <AdminConfiguracoesPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>

      {/* Catch-all for any unknown /admin/* path: bounces team_member
          sessions into /portal; super_admin falls through to NotFound. */}
      <Route path="/admin/:rest*">
        {() => (
          <TeamMemberToPortal>
            <NotFound />
          </TeamMemberToPortal>
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
    </ProvisionalPasswordGate>
  );
}

function App() {
  // BFCache / histórico: ao restaurar uma página do cache de back-forward, o
  // DOM previamente renderizado volta sem re-executar guards. Combinado com o
  // fluxo público /responder (que sanitiza a sessão privilegiada na entrada),
  // isto poderia exibir transitoriamente telas de admin/portal já renderizadas.
  // Forçamos um reload em restores de BFCache para que /auth/me seja
  // reavaliado do zero e os guards redirecionem quando não há sessão válida.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </ErrorBoundary>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
