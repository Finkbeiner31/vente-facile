/**
 * Single source of truth for role meta (labels, descriptions, scope, key permissions).
 * Used by both the "Rôles" tab and the "Profils" tab in Administration,
 * so role meaning stays synchronized across the SaaS.
 *
 * Derives the underlying access rules from src/lib/permissions.ts.
 */
import {
  AppRole,
  getDataScope,
  canPerformAction,
  canAccessModule,
} from './permissions';

export interface RoleDefinition {
  key: AppRole;
  label: string;
  shortDescription: string;
  scopeLabel: string;
  badgeClass: string;
}

export const ROLE_DEFINITIONS: Record<AppRole, RoleDefinition> = {
  admin: {
    key: 'admin',
    label: 'Administrateur',
    shortDescription:
      'Accès complet à toutes les fonctionnalités, données et paramètres de la plateforme.',
    scopeLabel: 'Toutes les données (global)',
    badgeClass: 'bg-destructive/10 text-destructive border-destructive/20',
  },
  manager: {
    key: 'manager',
    label: 'Responsable',
    shortDescription:
      "Voit les données de son équipe et supervise les commerciaux. Accès partiel à l'administration.",
    scopeLabel: 'Données de son équipe',
    badgeClass: 'bg-blue-500/10 text-blue-700 border-blue-200',
  },
  sales_rep: {
    key: 'sales_rep',
    label: 'Commercial',
    shortDescription:
      'Accès à ses propres clients, visites, tâches, tournées et rapports.',
    scopeLabel: 'Ses propres données uniquement',
    badgeClass: 'bg-primary/10 text-primary border-primary/20',
  },
  executive: {
    key: 'executive',
    label: 'Observateur',
    shortDescription:
      'Accès en lecture seule aux tableaux de bord, clients et rapports. Aucune modification possible.',
    scopeLabel: 'Lecture seule',
    badgeClass: 'bg-muted text-muted-foreground border-border',
  },
};

export function getRoleDefinition(role: AppRole | string | null): RoleDefinition | null {
  if (!role) return null;
  return (ROLE_DEFINITIONS as Record<string, RoleDefinition>)[role] ?? null;
}

/**
 * Build a concise list of operational permissions for a role,
 * derived from the real permission matrix in permissions.ts so the
 * UI never drifts from the actual access logic.
 */
export interface RolePermissionItem {
  label: string;
  allowed: boolean;
}

export function getRolePermissionsSummary(role: AppRole | string | null): RolePermissionItem[] {
  if (!role) return [];
  const r = role as AppRole;
  const scope = getDataScope(r);

  const scopeText =
    scope === 'global' ? 'Tous les clients (global)' :
    scope === 'team'   ? "Clients de l'équipe" :
    scope === 'own'    ? 'Uniquement ses clients assignés' :
                         'Lecture seule';

  return [
    { label: `Visibilité : ${scopeText}`, allowed: true },
    { label: 'Créer / modifier des clients', allowed: canPerformAction(r, 'create_customer') },
    { label: 'Saisir des rapports de visite', allowed: canPerformAction(r, 'create_report') },
    { label: 'Planifier et lancer des tournées', allowed: canPerformAction(r, 'plan_tournee') },
    { label: 'Gérer les promotions', allowed: canPerformAction(r, 'create_promotion') },
    { label: "Accéder à l'administration", allowed: canAccessModule(r, 'admin') },
    { label: 'Gérer les utilisateurs et rôles', allowed: canPerformAction(r, 'manage_roles') },
    { label: 'Importer des données', allowed: canPerformAction(r, 'import_data') },
    { label: 'Se connecter en tant que (impersonation)', allowed: canPerformAction(r, 'impersonate') },
  ];
}
