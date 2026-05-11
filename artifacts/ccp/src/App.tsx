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
import KickoffPage from "@/pages/kickoff/index";
import KickoffSelectPage from "@/pages/kickoff/select";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { ClinicAccessGuard } from "@/components/clinic-access-guard";
import { TeamMemberToPortal } from "@/components/role-redirect";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { getStoredToken, getActiveClinicId, useMyClinics } from "@/hooks/use-auth";
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
import ClinicDocumentsPage from "@/pages/clinic-documents/index";
import AssinarPage from "@/pages/assinar/index";
import MeClinicasPage from "@/pages/me/clinicas";
import PortalHome from "@/pages/portal/index";
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
  const [, navigate] = useLocation();
  const pilarParam = new URLSearchParams(window.location.search).get("pilar");

  const { data, isLoading } = useQuery({
    queryKey: ["diagnostico-latest-active"],
    queryFn: fetchLatestActive,
    retry: false,
  });

  useEffect(() => {
    if (isLoading) return;
    const pilarQuery = pilarParam ? `?pilar=${encodeURIComponent(pilarParam)}` : "";
    if (data?.id) {
      navigate(`/diagnostico/${data.id}${pilarQuery}`, { replace: true });
    } else {
      navigate(`/diagnostico/select${pilarQuery}`, { replace: true });
    }
  }, [isLoading, data, navigate, pilarParam]);

  return null;
}

/**
 * Resolves the active clinic and redirects to `${basePath}/${clinicId}`.
 * Used by `/portal/<module>` shortcut routes so the manager doesn't have
 * to type/keep a clinic id in the URL.
 */
function PortalActiveRedirect({ basePath }: { basePath: string }) {
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
  const id =
    (stored && clinics.some((c) => c.id === stored) ? stored : null) ??
    clinics[0]?.id ??
    null;
  if (!id) return <Redirect to="/portal" />;
  return <Redirect to={`${basePath}/${id}`} />;
}

setAuthTokenGetter(getStoredToken);

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/admin/login" component={AdminLogin} />

      {/* Public electronic-signature page — no auth, no AppLayout. */}
      <Route path="/assinar/:token" component={AssinarPage} />

      <Route path="/convite" component={ConvitePage} />

      {/* Multi-clinic chooser for team members (post-login landing). */}
      <Route path="/me/clinicas">
        {() => (
          <AppLayout>
            <MeClinicasPage />
          </AppLayout>
        )}
      </Route>

      {/* ─── Portal do Gestor (team_member dedicated namespace) ─── */}
      <Route path="/portal">
        {() => (
          <PortalLayout>
            <ClinicAccessGuard>
              <PortalHome />
            </ClinicAccessGuard>
          </PortalLayout>
        )}
      </Route>
      <Route path="/portal/clinica">
        {() => <PortalActiveRedirect basePath="/portal/clinica" />}
      </Route>
      <Route path="/portal/clinica/:id">
        {(params) => (
          <PortalLayout>
            <ClinicAccessGuard clinicId={params.id}>
              <ClinicDetail mode="portal" />
            </ClinicAccessGuard>
          </PortalLayout>
        )}
      </Route>
      <Route path="/portal/kickoff">
        {() => (
          <PortalLayout>
            <ClinicAccessGuard>
              <KickoffSelectPage />
            </ClinicAccessGuard>
          </PortalLayout>
        )}
      </Route>
      <Route path="/portal/kickoff/:clinicId">
        {(params) => (
          <PortalLayout>
            <ClinicAccessGuard clinicId={params.clinicId}>
              <KickoffPage />
            </ClinicAccessGuard>
          </PortalLayout>
        )}
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
        {() => <PortalActiveRedirect basePath="/portal/delegacao" />}
      </Route>
      <Route path="/portal/delegacao/:clinicId">
        {(params) => (
          <PortalLayout>
            <ClinicAccessGuard clinicId={params.clinicId}>
              <DelegacaoPage />
            </ClinicAccessGuard>
          </PortalLayout>
        )}
      </Route>
      <Route path="/portal/riscos">
        {() => <PortalActiveRedirect basePath="/portal/riscos" />}
      </Route>
      <Route path="/portal/riscos/:clinicId">
        {(params) => (
          <PortalLayout>
            <ClinicAccessGuard clinicId={params.clinicId}>
              <RiscosPage />
            </ClinicAccessGuard>
          </PortalLayout>
        )}
      </Route>
      <Route path="/portal/acao">
        {() => <PortalActiveRedirect basePath="/portal/acao" />}
      </Route>
      <Route path="/portal/acao/:clinicId">
        {(params) => (
          <PortalLayout>
            <ClinicAccessGuard clinicId={params.clinicId}>
              <AcaoPage />
            </ClinicAccessGuard>
          </PortalLayout>
        )}
      </Route>
      <Route path="/portal/processos">
        {() => <PortalActiveRedirect basePath="/portal/processos" />}
      </Route>
      <Route path="/portal/processos/:clinicId">
        {(params) => (
          <PortalLayout>
            <ClinicAccessGuard clinicId={params.clinicId}>
              <ProcessosPage />
            </ClinicAccessGuard>
          </PortalLayout>
        )}
      </Route>
      <Route path="/portal/evidencias">
        {() => <PortalActiveRedirect basePath="/portal/evidencias" />}
      </Route>
      <Route path="/portal/evidencias/:clinicId">
        {(params) => (
          <PortalLayout>
            <ClinicAccessGuard clinicId={params.clinicId}>
              <EvidenciasPage />
            </ClinicAccessGuard>
          </PortalLayout>
        )}
      </Route>
      <Route path="/portal/documentos">
        {() => <PortalActiveRedirect basePath="/portal/documentos" />}
      </Route>
      <Route path="/portal/documentos/:clinicId">
        {(params) => (
          <PortalLayout>
            <ClinicAccessGuard clinicId={params.clinicId}>
              <DocumentosPage />
            </ClinicAccessGuard>
          </PortalLayout>
        )}
      </Route>
      <Route path="/portal/relatorios">
        {() => <PortalActiveRedirect basePath="/portal/relatorios" />}
      </Route>
      <Route path="/portal/relatorios/:clinicId">
        {(params) => (
          <PortalLayout>
            <ClinicAccessGuard clinicId={params.clinicId}>
              <RelatoriosPage />
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

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
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
