import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import Clinics from "@/pages/clinics/index";
import NewClinic from "@/pages/clinics/new";
import ClinicDetail from "@/pages/clinics/detail";
import Notifications from "@/pages/notifications/index";
import AdminLogin from "@/pages/admin-login";
import KickoffPage from "@/pages/kickoff/index";
import KickoffSelectPage from "@/pages/kickoff/select";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { getStoredToken } from "@/hooks/use-auth";
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
import { ErrorBoundary } from "@/components/error-boundary";

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

setAuthTokenGetter(getStoredToken);

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/admin/login" component={AdminLogin} />

      <Route path="/convite" component={ConvitePage} />

      <Route path="/">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <Dashboard />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>

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
      <Route path="/admin/clinicas/:id/documentos">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <ClinicDocumentsPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>
      <Route path="/admin/clinicas/:id">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <ClinicDetail />
            </SuperAdminGuard>
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

      <Route path="/notifications">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <Notifications />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>

      <Route path="/kickoff">
        <Redirect to="/kickoff/select" />
      </Route>
      <Route path="/kickoff/select">
        <AppLayout>
          <SuperAdminGuard>
            <KickoffSelectPage />
          </SuperAdminGuard>
        </AppLayout>
      </Route>
      <Route path="/kickoff/:clinicId">
        {(params) => (
          <AppLayout>
            <SuperAdminGuard>
              <KickoffPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>

      <Route path="/diagnostico">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <DiagnosticoEntrypoint />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>
      <Route path="/diagnostico/select">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <DiagnosticoSelectPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>
      <Route path="/diagnostico/comparar">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <DiagnosticoComparar />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>
      <Route path="/diagnostico/:id/resultado">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <DiagnosticoResultado />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>
      <Route path="/diagnostico/:id">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <DiagnosticoWizard />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>

      <Route path="/delegacao">
        <Redirect to="/delegacao/select" />
      </Route>
      <Route path="/delegacao/select">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <DelegacaoPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>
      <Route path="/delegacao/:clinicId">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <DelegacaoPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>

      <Route path="/riscos">
        <Redirect to="/riscos/select" />
      </Route>
      <Route path="/riscos/select">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <RiscosPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>
      <Route path="/riscos/:clinicId">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <RiscosPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>

      <Route path="/acao">
        <Redirect to="/acao/select" />
      </Route>
      <Route path="/acao/select">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <AcaoPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>
      <Route path="/acao/:clinicId">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <AcaoPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>

      <Route path="/processos">
        <Redirect to="/processos/select" />
      </Route>
      <Route path="/processos/select">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <ProcessosPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>
      <Route path="/processos/:clinicId">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <ProcessosPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>

      <Route path="/evidencias">
        <Redirect to="/evidencias/select" />
      </Route>
      <Route path="/evidencias/select">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <EvidenciasPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>
      <Route path="/evidencias/:clinicId">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <EvidenciasPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>

      <Route path="/documentos">
        <Redirect to="/documentos/select" />
      </Route>
      <Route path="/documentos/select">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <DocumentosPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>
      <Route path="/documentos/:clinicId">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <DocumentosPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>

      <Route path="/relatorios">
        <Redirect to="/relatorios/select" />
      </Route>
      <Route path="/relatorios/select">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <RelatoriosPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>
      <Route path="/relatorios/:clinicId">
        {() => (
          <AppLayout>
            <SuperAdminGuard>
              <RelatoriosPage />
            </SuperAdminGuard>
          </AppLayout>
        )}
      </Route>

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
