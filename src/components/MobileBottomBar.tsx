import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Route, ListChecks, TrendingUp, FileText, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { canAccessModule, type AppRole, type ModuleId } from '@/lib/permissions';

const items: { to: string; icon: any; label: string; module: ModuleId }[] = [
  { to: '/', icon: LayoutDashboard, label: 'Accueil', module: 'dashboard' },
  { to: '/clients', icon: Users, label: 'Clients', module: 'clients' },
  { to: '/tournees', icon: Route, label: 'Tournées', module: 'routes' },
  { to: '/taches', icon: ListChecks, label: 'Tâches', module: 'tasks' },
  { to: '/opportunites', icon: TrendingUp, label: 'Pipeline', module: 'opportunities' },
];

// Observateur gets a different set focused on read-only
const observerItems: { to: string; icon: any; label: string; module: ModuleId }[] = [
  { to: '/', icon: LayoutDashboard, label: 'Accueil', module: 'dashboard' },
  { to: '/clients', icon: Users, label: 'Clients', module: 'clients' },
  { to: '/rapports', icon: FileText, label: 'Rapports', module: 'reports' },
  { to: '/promotions', icon: Eye, label: 'Promos', module: 'promotions' },
];

export function MobileBottomBar() {
  const { pathname } = useLocation();
  const { role: authRole } = useAuth();
  const { effectiveRole, isImpersonating } = useImpersonation();
  const role = (isImpersonating ? effectiveRole : authRole) as AppRole | null;

  const baseItems = role === 'executive' ? observerItems : items;
  const visibleItems = baseItems.filter(item => canAccessModule(role, item.module));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-sm md:hidden safe-area-bottom">
      <div className="flex items-stretch">
        {visibleItems.map(({ to, icon: Icon, label }) => {
          const active = pathname === to || (to !== '/' && pathname.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className={cn('h-5 w-5', active && 'text-primary')} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
