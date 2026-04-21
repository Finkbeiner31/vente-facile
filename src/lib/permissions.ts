/**
 * Centralized Role-Based Access Control for F7 Sales Pilot
 * 
 * Roles:
 *   admin      → Administrateur: full global access
 *   manager    → Responsable: team-scoped supervision
 *   sales_rep  → Commercial: own operational perimeter
 *   executive  → Observateur: read-only visibility
 */

export type AppRole = 'admin' | 'manager' | 'sales_rep' | 'executive';

/* ─── Module IDs ──────────────────────────────────────── */
export type ModuleId =
  | 'dashboard'
  | 'clients'
  | 'map'
  | 'routes'
  | 'reports'
  | 'tasks'
  | 'opportunities'
  | 'promotions'
  | 'my_info'
  | 'admin'
  | 'admin_import'
  | 'admin_import_ca'
  | 'admin_history_ca';

/* ─── Action IDs ──────────────────────────────────────── */
export type ActionId =
  | 'create_customer'
  | 'edit_customer'
  | 'delete_customer'
  | 'merge_customer'
  | 'archive_customer'
  | 'create_report'
  | 'edit_report'
  | 'create_task'
  | 'edit_task'
  | 'create_opportunity'
  | 'edit_opportunity'
  | 'manage_zones'
  | 'manage_roles'
  | 'manage_profiles'
  | 'assign_customers'
  | 'impersonate'
  | 'import_data'
  | 'plan_tournee'
  | 'run_tournee'
  | 'create_promotion'
  | 'edit_promotion'
  | 'delete_promotion'
  | 'regenerate_tour';

/* ─── Data scope ──────────────────────────────────────── */
export type DataScope = 'global' | 'team' | 'own' | 'readonly';

/* ─── Route → module mapping ─────────────────────────── */
const routeModuleMap: Array<{ path: string; exact?: boolean; module: ModuleId }> = [
  { path: '/', exact: true, module: 'dashboard' },
  { path: '/clients', module: 'clients' },
  { path: '/carte', module: 'map' },
  { path: '/tournees', module: 'routes' },
  { path: '/rapports', module: 'reports' },
  { path: '/taches', module: 'tasks' },
  { path: '/opportunites', module: 'opportunities' },
  { path: '/promotions', module: 'promotions' },
  { path: '/mes-infos', exact: true, module: 'my_info' },
  { path: '/admin/import-ca', exact: true, module: 'admin_import_ca' },
  { path: '/admin/historique-ca', exact: true, module: 'admin_history_ca' },
  { path: '/admin/import', exact: true, module: 'admin_import' },
  { path: '/admin', module: 'admin' },
];

/* ─── Module access matrix ────────────────────────────── */
const moduleAccess: Record<ModuleId, AppRole[]> = {
  dashboard:        ['admin', 'manager', 'sales_rep', 'executive'],
  clients:          ['admin', 'manager', 'sales_rep', 'executive'],
  map:              ['admin', 'manager', 'sales_rep', 'executive'],
  routes:           ['admin', 'manager', 'sales_rep'],
  reports:          ['admin', 'manager', 'sales_rep', 'executive'],
  tasks:            ['admin', 'manager', 'sales_rep'],
  opportunities:    ['admin', 'manager', 'sales_rep'],
  promotions:       ['admin', 'manager', 'sales_rep', 'executive'],
  my_info:          ['admin', 'manager', 'sales_rep', 'executive'],
  admin:            ['admin', 'manager'],
  admin_import:     ['admin'],
  admin_import_ca:  ['admin'],
  admin_history_ca: ['admin', 'manager'],
};

/* ─── Action permission matrix ────────────────────────── */
const actionAccess: Record<ActionId, AppRole[]> = {
  create_customer:    ['admin', 'manager', 'sales_rep'],
  edit_customer:      ['admin', 'manager', 'sales_rep'],
  delete_customer:    ['admin'],
  merge_customer:     ['admin'],
  archive_customer:   ['admin', 'manager'],
  create_report:      ['admin', 'manager', 'sales_rep'],
  edit_report:        ['admin', 'manager', 'sales_rep'],
  create_task:        ['admin', 'manager', 'sales_rep'],
  edit_task:          ['admin', 'manager', 'sales_rep'],
  create_opportunity: ['admin', 'manager', 'sales_rep'],
  edit_opportunity:   ['admin', 'manager', 'sales_rep'],
  manage_zones:       ['admin'],
  manage_roles:       ['admin'],
  manage_profiles:    ['admin'],
  assign_customers:   ['admin'],
  impersonate:        ['admin'],
  import_data:        ['admin'],
  plan_tournee:       ['admin', 'manager', 'sales_rep'],
  run_tournee:        ['admin', 'manager', 'sales_rep'],
  create_promotion:   ['admin', 'manager'],
  edit_promotion:     ['admin', 'manager'],
  delete_promotion:   ['admin', 'manager'],
  regenerate_tour:    ['admin', 'manager', 'sales_rep'],
};

/* ─── Data scope per role ─────────────────────────────── */
const dataScopes: Record<AppRole, DataScope> = {
  admin:     'global',
  manager:   'team',
  sales_rep: 'own',
  executive: 'readonly',
};

/* ═══ PUBLIC API ═══════════════════════════════════════ */

/** Check if a role can access a module */
export function canAccessModule(role: AppRole | null, module: ModuleId): boolean {
  if (!role) return false;
  return moduleAccess[module]?.includes(role) ?? false;
}

/** Check if a role can perform an action */
export function canPerformAction(role: AppRole | null, action: ActionId): boolean {
  if (!role) return false;
  return actionAccess[action]?.includes(role) ?? false;
}

/** Get data scope for a role */
export function getDataScope(role: AppRole | null): DataScope {
  if (!role) return 'readonly';
  return dataScopes[role];
}

/** Check if role is read-only */
export function isReadOnly(role: AppRole | null): boolean {
  return getDataScope(role) === 'readonly';
}

/** Resolve a route path to a module ID */
export function getModuleForRoute(path: string): ModuleId | null {
  // Check exact matches first
  for (const entry of routeModuleMap) {
    if (entry.exact && path === entry.path) return entry.module;
  }
  // Then prefix matches (longer paths first due to order)
  for (const entry of routeModuleMap) {
    if (!entry.exact && (path === entry.path || path.startsWith(entry.path + '/'))) {
      return entry.module;
    }
  }
  return null;
}

/** Check if a role can access a given route path */
export function canAccessRoute(role: AppRole | null, path: string): boolean {
  if (!role) return false;
  const module = getModuleForRoute(path);
  if (!module) return true; // Unknown routes → allow (caught by 404)
  return canAccessModule(role, module);
}

/** Get the role display label in French */
export function getRoleLabel(role: AppRole | null): string {
  switch (role) {
    case 'admin': return 'Administrateur';
    case 'manager': return 'Responsable';
    case 'sales_rep': return 'Commercial';
    case 'executive': return 'Observateur';
    default: return 'Inconnu';
  }
}

/** Get the sidebar navigation items filtered by role */
export function getVisibleModules(role: AppRole | null): ModuleId[] {
  if (!role) return [];
  return (Object.keys(moduleAccess) as ModuleId[]).filter(m => moduleAccess[m].includes(role));
}
