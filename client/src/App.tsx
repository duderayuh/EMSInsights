import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import AdminPage from "@/pages/admin";
import LoginPage from "@/pages/login";
import HospitalCallDetail from "@/pages/hospital-call-detail";
import AnalyticsPage from "@/pages/analytics";
import HospitalPage from "@/pages/hospital";
import SettingsPage from "@/pages/settings";
import AlertManagementPage from "@/pages/alert-management";
import PublicHealthAnalytics from "@/pages/PublicHealthAnalytics";
import IncidentsPage from "@/pages/incidents";
import { useAuth } from "@/hooks/useAuth";

// Protected route wrapper component
function ProtectedRoute({ component: Component, adminOnly = false, superAdminOnly = false }: { component: any, adminOnly?: boolean, superAdminOnly?: boolean }) {
  const { isAuthenticated, hasAdminAccess, isSuperAdmin, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  // Show loading while auth is being checked
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, redirect to login using wouter
  if (!isAuthenticated) {
    const redirectParam = location !== "/login" ? `?redirect=${encodeURIComponent(location)}` : "";
    setLocation(`/login${redirectParam}`);
    return null;
  }

  // Check super admin access if required
  if (superAdminOnly && !isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600">This page requires Super Admin privileges.</p>
        </div>
      </div>
    );
  }

  // Check admin access if required
  if (adminOnly && !hasAdminAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  // If authenticated (and admin if required), render the component
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/admin">
        {() => <ProtectedRoute component={AdminPage} superAdminOnly={true} />}
      </Route>
      <Route path="/hospital-calls/:id">
        {() => <ProtectedRoute component={HospitalCallDetail} />}
      </Route>
      <Route path="/analytics">
        {() => <ProtectedRoute component={AnalyticsPage} adminOnly={true} />}
      </Route>
      <Route path="/public-health">
        {() => <ProtectedRoute component={PublicHealthAnalytics} adminOnly={true} />}
      </Route>
      <Route path="/hospital">
        {() => <ProtectedRoute component={HospitalPage} adminOnly={true} />}
      </Route>
      <Route path="/settings">
        {() => <ProtectedRoute component={SettingsPage} adminOnly={true} />}
      </Route>
      <Route path="/alert-management">
        {() => <ProtectedRoute component={AlertManagementPage} adminOnly={true} />}
      </Route>
      <Route path="/incidents">
        {() => <ProtectedRoute component={IncidentsPage} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
