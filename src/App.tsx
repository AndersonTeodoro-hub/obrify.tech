import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import "@/i18n";

// Pages
import AuthPage from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

// App Pages
import { AppLayout } from "./components/layout/AppLayout";
import Dashboard from "./pages/app/Dashboard";
import Organizations from "./pages/app/Organizations";
import Sites from "./pages/app/Sites";
import SiteDetail from "./pages/app/SiteDetail";
import Captures from "./pages/app/Captures";
import Inspections from "./pages/app/Inspections";
import Reports from "./pages/app/Reports";
import Drone from "./pages/app/Drone";
import Settings from "./pages/app/Settings";
import InspectionTemplates from "./pages/app/InspectionTemplates";
import InspectionDetail from "./pages/app/InspectionDetail";
import NonConformities from "./pages/app/NonConformities";
import IncompatiCheck from "./pages/app/IncompatiCheck";
import ProjectKnowledge from "./pages/app/ProjectKnowledge";
import AcceptInvite from "./pages/AcceptInvite";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark" storageKey="obrify-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
            <Route path="/" element={<Navigate to="/auth" replace />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/invite/:token" element={<AcceptInvite />} />
              <Route 
                path="/app" 
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="organizations" element={<Organizations />} />
                <Route path="sites" element={<Sites />} />
                <Route path="sites/:siteId" element={<SiteDetail />} />
                <Route path="captures" element={<Captures />} />
                <Route path="inspections" element={<Inspections />} />
                <Route path="inspections/:inspectionId" element={<InspectionDetail />} />
                <Route path="nonconformities" element={<NonConformities />} />
                <Route path="incompaticheck" element={<IncompatiCheck />} />
                <Route path="project-knowledge" element={<ProjectKnowledge />} />
                <Route path="reports" element={<Reports />} />
                <Route path="drone" element={<Drone />} />
                <Route path="settings" element={<Settings />} />
                <Route path="settings/templates" element={<InspectionTemplates />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
