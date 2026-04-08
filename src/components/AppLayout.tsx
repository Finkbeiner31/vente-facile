import { Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomBar } from '@/components/MobileBottomBar';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function AppLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
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
        <FloatingActionButton />
      </div>
    </SidebarProvider>
  );
}
