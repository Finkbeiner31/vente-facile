import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { TourSessionProvider } from "@/contexts/TourSessionContext";
import { ImpersonationProvider } from "@/contexts/ImpersonationContext";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import CustomersPage from "@/pages/CustomersPage";
import CustomerDetailPage from "@/pages/CustomerDetailPage";
import RoutesPage from "@/pages/RoutesPage";
import ReportsPage from "@/pages/ReportsPage";
import TasksPage from "@/pages/TasksPage";
import OpportunitiesPage from "@/pages/OpportunitiesPage";
import AdminPage from "@/pages/AdminPage";
import BulkImportPage from "@/pages/BulkImportPage";
import RevenueImportPage from "@/pages/RevenueImportPage";
import RevenueHistoryPage from "@/pages/RevenueHistoryPage";
import MapPage from "@/pages/MapPage";
import PromotionsPage from "@/pages/PromotionsPage";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

function ImpersonationWrapper({ children }: { children: React.ReactNode }) {
  const auth = useContext(AuthContextRaw);
  const user = auth?.user ?? null;
  const role = auth?.role ?? null;
  const profile = auth?.profile ?? null;
  return (
    <ImpersonationProvider 
      realUserId={user?.id ?? null} 
      realRole={role}
      realFullName={profile?.full_name ?? null}
    >
      {children}
    </ImpersonationProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ImpersonationWrapper>
          <TourSessionProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/clients" element={<CustomersPage />} />
              <Route path="/clients/:id" element={<CustomerDetailPage />} />
              <Route path="/tournees" element={<RoutesPage />} />
              <Route path="/carte" element={<MapPage />} />
              <Route path="/rapports" element={<ReportsPage />} />
              <Route path="/taches" element={<TasksPage />} />
              <Route path="/opportunites" element={<OpportunitiesPage />} />
              <Route path="/promotions" element={<PromotionsPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin/import" element={<BulkImportPage />} />
              <Route path="/admin/import-ca" element={<RevenueImportPage />} />
              <Route path="/admin/historique-ca" element={<RevenueHistoryPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </TourSessionProvider>
          </ImpersonationWrapper>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
