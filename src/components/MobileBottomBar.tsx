import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Route, ListChecks, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { to: '/', icon: LayoutDashboard, label: 'Accueil' },
  { to: '/clients', icon: Users, label: 'Clients' },
  { to: '/tournees', icon: Route, label: 'Tournées' },
  { to: '/taches', icon: ListChecks, label: 'Tâches' },
  { to: '/opportunites', icon: TrendingUp, label: 'Pipeline' },
];

export function MobileBottomBar() {
  const { pathname } = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-sm md:hidden safe-area-bottom">
      <div className="flex items-stretch">
        {items.map(({ to, icon: Icon, label }) => {
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
