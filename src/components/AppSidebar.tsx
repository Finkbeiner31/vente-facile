import {
  LayoutDashboard,
  Users,
  MapPin,
  Map,
  FileText,
  CheckSquare,
  TrendingUp,
  Tag,
  Settings,
  LogOut,
  Flame,
  Upload,
  DollarSign,
  BarChart3,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { canAccessModule, getRoleLabel, type AppRole, type ModuleId } from '@/lib/permissions';

const mainNav: { title: string; url: string; icon: any; module: ModuleId }[] = [
  { title: 'Tableau de bord', url: '/', icon: LayoutDashboard, module: 'dashboard' },
  { title: 'Clients', url: '/clients', icon: Users, module: 'clients' },
  { title: 'Carte clients', url: '/carte', icon: Map, module: 'map' },
  { title: 'Tournées', url: '/tournees', icon: MapPin, module: 'routes' },
  { title: 'Rapports de visite', url: '/rapports', icon: FileText, module: 'reports' },
  { title: 'Tâches', url: '/taches', icon: CheckSquare, module: 'tasks' },
  { title: 'Opportunités', url: '/opportunites', icon: TrendingUp, module: 'opportunities' },
  { title: 'Promotions', url: '/promotions', icon: Tag, module: 'promotions' },
];

const adminNav: { title: string; url: string; icon: any; module: ModuleId }[] = [
  { title: 'Administration', url: '/admin', icon: Settings, module: 'admin' },
  { title: 'Import clients', url: '/admin/import', icon: Upload, module: 'admin_import' },
  { title: 'Import CA mensuel', url: '/admin/import-ca', icon: DollarSign, module: 'admin_import_ca' },
  { title: 'Historique CA', url: '/admin/historique-ca', icon: BarChart3, module: 'admin_history_ca' },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { signOut, profile, role: realRole } = useAuth();
  const { effectiveRole, effectiveFullName, isImpersonating } = useImpersonation();
  const role = (isImpersonating ? effectiveRole : realRole) as AppRole | null;
  const displayName = isImpersonating ? effectiveFullName : profile?.full_name;

  const visibleMainNav = mainNav.filter(item => canAccessModule(role, item.module));
  const visibleAdminNav = adminNav.filter(item => canAccessModule(role, item.module));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Flame className="h-5 w-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-heading text-sm font-bold text-sidebar-foreground">
                F7 Sales Pilot
              </span>
              <span className="text-[10px] text-muted-foreground">
                v1.0
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleAdminNav.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Gestion</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdminNav.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className="hover:bg-sidebar-accent"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3">
        {!collapsed && (displayName || profile) && (
          <div className="mb-2 rounded-lg bg-sidebar-accent p-3">
            <p className="text-sm font-medium text-sidebar-foreground">
              {displayName || profile?.full_name || 'Utilisateur'}
            </p>
            <p className="text-xs text-muted-foreground">
              {getRoleLabel(role)}
            </p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start text-muted-foreground hover:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && 'Déconnexion'}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
