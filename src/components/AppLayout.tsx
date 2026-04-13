import { Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomBar } from '@/components/MobileBottomBar';

import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ADMIN_ROUTES = ['/admin', '/admin/import', '/admin/import-ca', '/admin/historique-ca'];

export default function AppLayout() {
  const { session, loading } = useAuth();
  const { isImpersonating, impersonatedUser, stopImpersonation, effectiveRole } = useImpersonation();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  // Block admin routes when impersonating a non-admin user
  const isAdminRoute = ADMIN_ROUTES.some(r => location.pathname === r || location.pathname.startsWith(r + '/'));
  if (isAdminRoute && isImpersonating && effectiveRole !== 'admin' && effectiveRole !== 'manager') {
    return <Navigate to="/" replace />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full flex-col">
        {isImpersonating && impersonatedUser && (
          <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-white">
            <span>Vous êtes connecté en tant que <strong>{impersonatedUser.full_name}</strong> (Mode admin)</span>
            <Button size="sm" variant="secondary" className="h-6 text-xs" onClick={stopImpersonation}>
              <X className="h-3 w-3 mr-1" />Revenir à mon compte
            </Button>
          </div>
        )}
        <div className="flex flex-1">
        <div className="hidden md:block">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 flex h-12 md:h-14 items-center border-b bg-background/80 backdrop-blur-sm px-4">
            <SidebarTrigger className="mr-4 hidden md:flex" />
            <span className="font-heading text-sm font-bold md:hidden text-primary">F7 Sales Pilot</span>
            <div className="flex-1" />
          </header>
          <main className="flex-1 p-3 md:p-6 lg:p-8 pb-20 md:pb-8 relative z-0">
            <Outlet />
          </main>
        </div>
        <MobileBottomBar />
        </div>
      </div>
    </SidebarProvider>
  );
}
