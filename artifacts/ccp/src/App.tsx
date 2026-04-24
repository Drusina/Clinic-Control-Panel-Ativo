import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { getStoredToken } from "@/hooks/use-auth";

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
