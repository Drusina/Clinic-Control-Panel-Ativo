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
  const { data, isLoading } = useQuery({
    queryKey: ["diagnostico-latest-active"],
    queryFn: fetchLatestActive,
    retry: false,
  });

  useEffect(() => {
    if (isLoading) return;
    if (data?.id) {
      navigate(`/diagnostico/${data.id}`, { replace: true });
    } else {
      navigate("/diagnostico/select", { replace: true });
    }
  }, [isLoading, data, navigate]);

  return null;
}

setAuthTokenGetter(getStoredToken);

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/admin/login" component={AdminLogin} />

      <Route path="/">
        {() => (
          <AppLayout>
            <Dashboard />
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
            <Notifications />
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

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
