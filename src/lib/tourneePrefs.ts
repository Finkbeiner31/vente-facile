/**
 * Shared optimizer preferences (departure / arrival points, order strategy,
 * relationship filter, zone logic, type filter).
 *
 * Persisted in localStorage so that:
 *  - the "Optimiser ma tournée" sheet remembers the user's last setup
 *  - the "Voir le trajet du jour" map honors the same departure/arrival/order
 *    logic as the optimizer (no silent override).
 *
 * Per-user namespace ensures impersonation doesn't leak prefs across users.
 */

import type {
  RouteStrategy,
  ZoneLogicFlags,
  TypeFilter,
  RelationshipFilter,
} from './tourneeOptimizer';

export type PointType = 'company' | 'home' | 'custom';

export interface TourneePrefs {
  departureType: PointType;
  arrivalType: PointType;
  strategy: RouteStrategy;
  typeFilter: TypeFilter;
  relationshipFilter: RelationshipFilter;
  zoneLogicFlags: ZoneLogicFlags;
  excludeRecent: boolean;
  visitTarget: number;
}

export const DEFAULT_PREFS: TourneePrefs = {
  departureType: 'company',
  arrivalType: 'company',
  strategy: 'nearest',
  typeFilter: 'tous',
  relationshipFilter: 'magasin_priority',
  zoneLogicFlags: { strict: true, tolerance: false, route: false },
  excludeRecent: true,
  visitTarget: 10,
};

const KEY = (userId: string | null | undefined) =>
  `f7sp.tourneePrefs.${userId || 'anon'}`;

export function loadPrefs(userId: string | null | undefined): TourneePrefs {
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<TourneePrefs>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      zoneLogicFlags: { ...DEFAULT_PREFS.zoneLogicFlags, ...(parsed.zoneLogicFlags || {}) },
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(userId: string | null | undefined, prefs: TourneePrefs): void {
  try {
    localStorage.setItem(KEY(userId), JSON.stringify(prefs));
  } catch {
    /* ignore quota errors */
  }
}

export function pointTypeLabel(t: PointType): string {
  switch (t) {
    case 'company': return 'Entreprise';
    case 'home': return 'Domicile';
    case 'custom': return 'Autre';
  }
}

export function strategyLabel(s: RouteStrategy): string {
  return s === 'nearest' ? 'Plus proche d’abord' : 'Plus loin d’abord';
}

export function relationshipLabel(r: RelationshipFilter): string {
  switch (r) {
    case 'tous': return 'Tous types';
    case 'magasin_priority': return 'Magasin prioritaire';
    case 'atelier_priority': return 'Atelier prioritaire';
    case 'mixte_priority': return 'Mixte prioritaire';
    case 'magasin_only': return 'Magasin uniquement';
    case 'atelier_only': return 'Atelier uniquement';
    case 'mixte_only': return 'Mixte uniquement';
  }
}

export function zoneLogicShortLabel(flags: ZoneLogicFlags): string {
  const parts: string[] = [];
  if (flags.strict) parts.push('Stricte');
  if (flags.tolerance) parts.push('Tolérance 15 km');
  if (flags.route) parts.push('Trajet A/R');
  return parts.length ? parts.join(' + ') : 'Stricte';
}
