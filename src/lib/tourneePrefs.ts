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

/** Allowed expansion radius around the selected zone, in km. */
export type ZoneToleranceKm = 0 | 5 | 10 | 15;
/** Allowed detour for route-side opportunities, in minutes. */
export type DetourToleranceMin = 5 | 10 | 15;

export interface TourneePrefs {
  departureType: PointType;
  arrivalType: PointType;
  strategy: RouteStrategy;
  typeFilter: TypeFilter;
  relationshipFilter: RelationshipFilter;
  /**
   * @deprecated Remplacé par `zoneToleranceKm` + `routeInclusion` +
   * `detourToleranceMin`. Conservé pour compat. localStorage uniquement —
   * la zone sélectionnée est désormais toujours la base obligatoire.
   */
  zoneLogicFlags: ZoneLogicFlags;
  /** Tolérance autour de la zone sélectionnée (km). 0 = base stricte. */
  zoneToleranceKm: ZoneToleranceKm;
  /** Inclure les clients accessibles avec un détour limité sur le trajet A/R. */
  routeInclusion: boolean;
  /** Tolérance de détour quand `routeInclusion` est actif (minutes). */
  detourToleranceMin: DetourToleranceMin;
  excludeRecent: boolean;
  /**
   * @deprecated Le système est désormais entièrement piloté par
   * `workdayTargetHours`. Conservé uniquement pour la rétro-compatibilité
   * des prefs déjà sauvegardées dans localStorage.
   */
  visitTarget?: number;
  /** Target total workday duration in hours (driving + visits). Default 8h. */
  workdayTargetHours: number;
}

export const DEFAULT_PREFS: TourneePrefs = {
  departureType: 'company',
  arrivalType: 'company',
  strategy: 'nearest',
  typeFilter: 'tous',
  relationshipFilter: 'magasin_priority',
  zoneLogicFlags: { strict: true, tolerance: false, route: false },
  zoneToleranceKm: 5,
  routeInclusion: false,
  detourToleranceMin: 10,
  excludeRecent: true,
  workdayTargetHours: 8,
};

const KEY = (userId: string | null | undefined) =>
  `f7sp.tourneePrefs.${userId || 'anon'}`;

export function loadPrefs(userId: string | null | undefined): TourneePrefs {
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<TourneePrefs>;
    const merged: TourneePrefs = {
      ...DEFAULT_PREFS,
      ...parsed,
      zoneLogicFlags: { ...DEFAULT_PREFS.zoneLogicFlags, ...(parsed.zoneLogicFlags || {}) },
    };
    // Migration douce depuis l'ancien `zoneLogicFlags` vers les nouveaux champs
    // explicites si l'utilisateur n'a jamais saisi ces nouvelles prefs.
    if (parsed.zoneToleranceKm === undefined && parsed.zoneLogicFlags?.tolerance) {
      merged.zoneToleranceKm = 15;
    }
    if (parsed.routeInclusion === undefined && parsed.zoneLogicFlags?.route) {
      merged.routeInclusion = true;
    }
    return merged;
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

/**
 * Étiquette compacte décrivant la logique de zone active.
 * Format : "Base zone · Tolérance Xkm · Trajet A/R Ymin"
 */
export function zoneLogicShortLabel(
  flagsOrPrefs: ZoneLogicFlags | { zoneToleranceKm: number; routeInclusion: boolean; detourToleranceMin: number },
): string {
  // Nouveau format (objet de prefs)
  if ('zoneToleranceKm' in flagsOrPrefs) {
    const parts: string[] = ['Base zone'];
    if (flagsOrPrefs.zoneToleranceKm > 0) parts.push(`Tolérance ${flagsOrPrefs.zoneToleranceKm} km`);
    if (flagsOrPrefs.routeInclusion) parts.push(`Trajet A/R ${flagsOrPrefs.detourToleranceMin} min`);
    return parts.join(' · ');
  }
  // Ancien format (flags) — fallback compat
  const parts: string[] = [];
  if (flagsOrPrefs.strict) parts.push('Stricte');
  if (flagsOrPrefs.tolerance) parts.push('Tolérance 15 km');
  if (flagsOrPrefs.route) parts.push('Trajet A/R');
  return parts.length ? parts.join(' + ') : 'Stricte';
}
