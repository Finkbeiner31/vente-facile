/**
 * Tournée Optimization Engine
 * 
 * Produces a realistic daily route from a selected zone,
 * balancing urgency, business value, and travel logic.
 * Structured for future learning/improvement.
 */

import { computeVisitStatus, getDefaultFrequency } from './visitFrequencyUtils';

// ── Types ──

export interface OptCustomer {
  id: string;
  company_name: string;
  customer_type: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  number_of_vehicles: number;
  annual_revenue_potential: number;
  last_visit_date: string | null;
  phone: string | null;
  sales_potential: string | null;
  visit_frequency: string | null;
  address: string | null;
  visit_duration_minutes?: number | null;
  relationship_type?: string | null;
  zone?: string | null;
}

export type RouteStrategy = 'nearest' | 'farthest';
export type ZoneLogic = 'strict' | 'tolerance' | 'route';

export interface ZoneLogicFlags {
  strict: boolean;
  tolerance: boolean;
  route: boolean;
}
export type TypeFilter = 'tous' | 'clients' | 'prospects';

/**
 * Commercial relationship filter mode.
 * - `tous`            : no relationship filter, no bonus
 * - `*_priority`      : keep all eligible accounts, give a strong score bonus to the chosen type
 * - `*_only`          : strictly keep only accounts of the chosen type
 */
export type RelationshipFilter =
  | 'tous'
  | 'magasin_priority' | 'atelier_priority' | 'mixte_priority'
  | 'magasin_only' | 'atelier_only' | 'mixte_only';

export type RelationshipType = 'magasin' | 'atelier' | 'mixte' | null;

export interface ScoredCustomer extends OptCustomer {
  /** Composite priority score (0-100+) */
  score: number;
  /** Distance from user position in km */
  distanceFromUser: number;
  /** Visit duration in minutes */
  visitDuration: number;
  /** Human-readable reasons for selection */
  reasons: string[];
  /** Is outside strict zone but included via tolerance/route */
  isOutsideZone: boolean;
}

/**
 * Endpoint of an optimized day route (départ "A" or arrivée "B").
 * Captured at optimization time so the tournée list and the map can render
 * the exact same A → clients → B structure without re-resolving anything.
 */
export interface RouteEndpoint {
  /** 'company' | 'home' | 'custom' — what the user picked in the optimizer */
  type: 'company' | 'home' | 'custom';
  /** Human label displayed in the UI (e.g. "Entreprise — 10 rue X, Lyon") */
  label: string;
  lat: number;
  lng: number;
}

export interface OptimizedRoute {
  customers: ScoredCustomer[];
  totalDistanceKm: number;
  estimatedDurationMin: number;
  totalTravelMin: number;
  totalVisitMin: number;
  /** Final departure point used to build the route (A). */
  departure?: RouteEndpoint | null;
  /** Final arrival point used to build the route (B). */
  arrival?: RouteEndpoint | null;
  /** Strategy actually applied (nearest / farthest). */
  strategy?: RouteStrategy;
  /** True if Google Directions road routing produced this order/distance. */
  usedRealRouting?: boolean;
  /** Real road polyline (Google Directions). Empty when fallback heuristic was used. */
  path?: { lat: number; lng: number }[];
}

export interface OptimizationConfig {
  visitTarget: number;
  strategy: RouteStrategy;
  zoneLogic: ZoneLogic;
  /** @deprecated remplacé par `zoneToleranceKm` + `routeInclusion`. Encore lu en fallback. */
  zoneLogicFlags?: ZoneLogicFlags;
  /** Tolérance autour de la zone sélectionnée (km). 0 = strictement zone. */
  zoneToleranceKm?: number;
  /** Inclure les comptes accessibles avec un détour limité sur le trajet A/R. */
  routeInclusion?: boolean;
  /** Tolérance de détour (minutes) quand `routeInclusion` est actif. */
  detourToleranceMin?: number;
  typeFilter: TypeFilter;
  /** Commercial relationship filter (Magasin / Atelier / Mixte). Defaults to 'magasin_priority'. */
  relationshipFilter?: RelationshipFilter;
  excludeRecentDays: number | null; // null = don't exclude
  departureLat: number;
  departureLng: number;
  arrivalLat: number;
  arrivalLng: number;
}

// ── Constants ──

export const DEFAULT_VISIT_DURATION_CLIENT = 30;
export const DEFAULT_VISIT_DURATION_PROSPECT = 20;
export const DEFAULT_VISIT_DURATION_PROSPECT_QUALIFIE = 30;
const ZONE_TOLERANCE_KM = 15;
const ROUTE_CORRIDOR_KM = 10;

// ── Geo helpers ──

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimateDriveMin(km: number): number {
  return Math.round(km / 50 * 60);
}

export function getVisitDuration(
  c: OptCustomer,
  overrides?: { client: number; prospect: number; prospect_qualifie: number },
): number {
  if (c.visit_duration_minutes && c.visit_duration_minutes > 0) return c.visit_duration_minutes;
  const defs = overrides || {
    client: DEFAULT_VISIT_DURATION_CLIENT,
    prospect: DEFAULT_VISIT_DURATION_PROSPECT,
    prospect_qualifie: DEFAULT_VISIT_DURATION_PROSPECT_QUALIFIE,
  };
  if (c.customer_type === 'prospect_qualifie') return defs.prospect_qualifie;
  if (c.customer_type === 'prospect') return defs.prospect;
  return defs.client;
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

/**
 * Check if a point is within a corridor between departure and arrival.
 * The corridor is defined as: distance(dep→point) + distance(point→arr) ≤ distance(dep→arr) + corridorKm
 */
function isOnRoute(
  lat: number, lng: number,
  depLat: number, depLng: number,
  arrLat: number, arrLng: number,
  corridorKm: number = ROUTE_CORRIDOR_KM,
): boolean {
  const directDist = haversineKm(depLat, depLng, arrLat, arrLng);
  const detour = haversineKm(depLat, depLng, lat, lng) + haversineKm(lat, lng, arrLat, arrLng);
  return (detour - directDist) <= corridorKm;
}

/**
 * Estime, en minutes, le détour induit par l'insertion d'un point sur le trajet
 * direct A → B. Plus précis pour le terrain qu'une simple tolérance en km.
 */
function detourMinutes(
  lat: number, lng: number,
  depLat: number, depLng: number,
  arrLat: number, arrLng: number,
): number {
  const directKm = haversineKm(depLat, depLng, arrLat, arrLng);
  const viaKm = haversineKm(depLat, depLng, lat, lng) + haversineKm(lat, lng, arrLat, arrLng);
  const extraKm = Math.max(0, viaKm - directKm);
  return estimateDriveMin(extraKm);
}

// ── Priority Scoring ──

/**
 * Compute a transparent, weighted priority score.
 * 
 * A. Visit urgency (0-40)
 * B. Business importance (0-30)  
 * C. Route relevance (0-20)
 * D. Relationship bonus (0-10)
 */
export function computeTourneePriority(
  c: OptCustomer,
  userLat: number,
  userLng: number,
  arrivalLat: number,
  arrivalLng: number,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let urgencyScore = 0;
  let businessScore = 0;
  let routeScore = 0;
  let relationshipScore = 0;

  // A. Visit urgency (0-40)
  const effectiveFreq = c.visit_frequency || getDefaultFrequency(c.customer_type);
  const visitStatus = computeVisitStatus(effectiveFreq, c.last_visit_date);

  if (visitStatus.status === 'en_retard') {
    urgencyScore = 40;
    reasons.push('En retard');
  } else if (visitStatus.status === 'a_visiter') {
    urgencyScore = 25;
    reasons.push('À visiter bientôt');
  } else {
    // "à jour" — still gets a small score if never visited
    const days = daysSince(c.last_visit_date);
    if (days === null) {
      urgencyScore = 35;
      reasons.push('Jamais visité');
    } else {
      urgencyScore = 5;
    }
  }

  // B. Business importance (0-30)
  const potential = c.annual_revenue_potential || 0;
  if (potential >= 50000) { businessScore += 20; reasons.push('Fort potentiel'); }
  else if (potential >= 20000) { businessScore += 14; }
  else if (potential >= 10000) { businessScore += 8; }
  else if (potential > 0) { businessScore += 3; }

  if (c.sales_potential === 'A') { businessScore += 10; if (!reasons.includes('Fort potentiel')) reasons.push('Priorité A'); }
  else if (c.sales_potential === 'B') { businessScore += 5; }

  if (c.customer_type === 'prospect_qualifie') {
    businessScore += 5;
    reasons.push('Prospect qualifié');
  }

  // C. Route relevance (0-20) — closer to route = higher score
  if (c.latitude != null && c.longitude != null) {
    const distUser = haversineKm(userLat, userLng, c.latitude, c.longitude);
    const onRoute = isOnRoute(c.latitude, c.longitude, userLat, userLng, arrivalLat, arrivalLng);

    if (onRoute) {
      routeScore = 18;
      reasons.push('Sur le trajet');
    } else if (distUser <= 10) {
      routeScore = 15;
    } else if (distUser <= 25) {
      routeScore = 10;
    } else if (distUser <= 50) {
      routeScore = 5;
    } else {
      routeScore = 1;
    }
  }

  // D. Relationship type bonus (0-10) — base bonus, augmenté ensuite par computeRelationshipBonus
  if (c.relationship_type === 'mixte') {
    relationshipScore = 5;
  }

  const score = urgencyScore + businessScore + routeScore + relationshipScore;
  return { score: Math.round(score), reasons };
}

/**
 * Returns the score bonus and an optional reason label based on the
 * selected relationship filter (Magasin/Atelier/Mixte priority).
 *
 * Default ranking when "magasin_priority" is active: Magasin > Mixte > Atelier > non renseigné.
 */
export function computeRelationshipBonus(
  relationshipType: string | null | undefined,
  filter: RelationshipFilter,
): { bonus: number; reason: string | null } {
  const rt = relationshipType || null;

  // Strict modes — handled at filter step, no extra scoring needed
  if (filter === 'magasin_only' || filter === 'atelier_only' || filter === 'mixte_only') {
    return { bonus: 0, reason: null };
  }

  if (filter === 'tous') {
    // Light typing bonus to push known accounts above unknown ones
    if (rt === 'magasin' || rt === 'atelier' || rt === 'mixte') return { bonus: 2, reason: null };
    return { bonus: 0, reason: null };
  }

  // Priority modes
  const targetMap: Record<string, 'magasin' | 'atelier' | 'mixte'> = {
    magasin_priority: 'magasin',
    atelier_priority: 'atelier',
    mixte_priority: 'mixte',
  };
  const target = targetMap[filter];

  if (rt === target) {
    return { bonus: 18, reason: target === 'magasin' ? 'Magasin prioritaire' : target === 'atelier' ? 'Atelier prioritaire' : 'Mixte prioritaire' };
  }

  // Default Magasin priority cascade (Magasin > Mixte > Atelier)
  if (target === 'magasin') {
    if (rt === 'mixte') return { bonus: 9, reason: null };
    if (rt === 'atelier') return { bonus: 3, reason: null };
    return { bonus: 0, reason: null }; // non renseigné
  }
  // Other priority modes: lighter cascade
  if (rt === 'magasin' || rt === 'mixte' || rt === 'atelier') return { bonus: 4, reason: null };
  return { bonus: 0, reason: null };
}

// ── Filtering ──

export function filterCandidates(
  allCustomers: OptCustomer[],
  zoneCustomerIds: Set<string>,
  config: OptimizationConfig,
): ScoredCustomer[] {
  const results: ScoredCustomer[] = [];

  for (const c of allCustomers) {
    if (c.latitude == null || c.longitude == null) continue;

    // Type filter
    const isProspect = c.customer_type === 'prospect' || c.customer_type === 'prospect_qualifie';
    if (config.typeFilter === 'clients' && isProspect) continue;
    if (config.typeFilter === 'prospects' && !isProspect) continue;

    // Relationship filter (strict only-modes exclude here)
    const relFilter: RelationshipFilter = config.relationshipFilter || 'magasin_priority';
    const rt = c.relationship_type || null;
    if (relFilter === 'magasin_only' && rt !== 'magasin') continue;
    if (relFilter === 'atelier_only' && rt !== 'atelier') continue;
    if (relFilter === 'mixte_only' && rt !== 'mixte') continue;

    // Exclude recently visited
    if (config.excludeRecentDays != null) {
      const days = daysSince(c.last_visit_date);
      if (days !== null && days <= config.excludeRecentDays) continue;
    }

    // Zone logic — support combined flags
    const flags: ZoneLogicFlags = config.zoneLogicFlags || {
      strict: config.zoneLogic === 'strict',
      tolerance: config.zoneLogic === 'tolerance',
      route: config.zoneLogic === 'route',
    };

    const inZone = zoneCustomerIds.has(c.id);
    let isOutsideZone = false;

    if (!inZone) {
      // If only strict is active, skip non-zone accounts
      const hasExtension = flags.tolerance || flags.route;
      if (!hasExtension) continue;

      let accepted = false;

      if (flags.tolerance) {
        const dist = haversineKm(config.departureLat, config.departureLng, c.latitude, c.longitude);
        if (dist <= ZONE_TOLERANCE_KM * 3) accepted = true;
      }

      if (!accepted && flags.route) {
        const onRoute = isOnRoute(
          c.latitude, c.longitude,
          config.departureLat, config.departureLng,
          config.arrivalLat, config.arrivalLng,
          ROUTE_CORRIDOR_KM,
        );
        if (onRoute) accepted = true;
      }

      if (!accepted) continue;
      isOutsideZone = true;
    }

    const distanceFromUser = haversineKm(config.departureLat, config.departureLng, c.latitude, c.longitude);
    const { score: baseScore, reasons } = computeTourneePriority(
      c, config.departureLat, config.departureLng, config.arrivalLat, config.arrivalLng,
    );
    const visitDuration = getVisitDuration(c);

    // Apply commercial relationship bonus
    const { bonus: relBonus, reason: relReason } = computeRelationshipBonus(rt, relFilter);
    const score = baseScore + relBonus;
    if (relReason && !reasons.includes(relReason)) reasons.push(relReason);

    if (isOutsideZone) {
      reasons.push('Hors zone');
    }

    results.push({
      ...c,
      score,
      distanceFromUser,
      visitDuration,
      reasons,
      isOutsideZone,
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results;
}

// ── Route Builder ──

/**
 * Build an optimized route using nearest-neighbor heuristic
 * with bias-to-end for the last stops.
 */
export function buildOptimizedRoute(
  candidates: ScoredCustomer[],
  config: OptimizationConfig,
): OptimizedRoute {
  if (candidates.length === 0) {
    return { customers: [], totalDistanceKm: 0, estimatedDurationMin: 0, totalTravelMin: 0, totalVisitMin: 0 };
  }

  const remaining = [...candidates];
  const ordered: ScoredCustomer[] = [];
  let currentLat = config.departureLat;
  let currentLng = config.departureLng;
  let totalKm = 0;
  let totalDriveMin = 0;
  let totalVisitMin = 0;

  const maxVisits = config.visitTarget;

  // Farthest strategy: first stop is farthest from departure
  if (config.strategy === 'farthest' && remaining.length > 0) {
    let maxDist = 0;
    let maxIdx = 0;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(config.departureLat, config.departureLng, remaining[i].latitude!, remaining[i].longitude!);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    const first = remaining.splice(maxIdx, 1)[0];
    ordered.push(first);
    totalKm += maxDist;
    totalDriveMin += estimateDriveMin(maxDist);
    totalVisitMin += first.visitDuration;
    currentLat = first.latitude!;
    currentLng = first.longitude!;
  }

  // Nearest-neighbor with business score weighting
  while (remaining.length > 0 && ordered.length < maxVisits) {
    const progressRatio = ordered.length / maxVisits;
    // As we get closer to end, bias toward arrival point
    const biasToEnd = progressRatio > 0.7 ? 0.3 : 0;
    // Also slightly factor in priority score to avoid pure geography
    const scoreFactor = 0.15;

    let bestComposite = Infinity;
    let bestIdx = -1;

    const maxScore = Math.max(...remaining.map(r => r.score), 1);

    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      const distFromCurrent = haversineKm(currentLat, currentLng, c.latitude!, c.longitude!);
      const distToEnd = haversineKm(c.latitude!, c.longitude!, config.arrivalLat, config.arrivalLng);
      const scoreBonus = (1 - c.score / maxScore) * distFromCurrent * scoreFactor;

      const composite = distFromCurrent * (1 - biasToEnd) + distToEnd * biasToEnd + scoreBonus;

      if (composite < bestComposite) {
        bestComposite = composite;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;

    const next = remaining.splice(bestIdx, 1)[0];
    const legKm = haversineKm(currentLat, currentLng, next.latitude!, next.longitude!);
    totalKm += legKm;
    totalDriveMin += estimateDriveMin(legKm);
    totalVisitMin += next.visitDuration;
    ordered.push(next);
    currentLat = next.latitude!;
    currentLng = next.longitude!;
  }

  // Add return leg to arrival
  if (ordered.length > 0) {
    const last = ordered[ordered.length - 1];
    const returnKm = haversineKm(last.latitude!, last.longitude!, config.arrivalLat, config.arrivalLng);
    totalKm += returnKm;
    totalDriveMin += estimateDriveMin(returnKm);
  }

  return {
    customers: ordered,
    totalDistanceKm: Math.round(totalKm * 10) / 10,
    estimatedDurationMin: totalDriveMin + totalVisitMin,
    totalTravelMin: totalDriveMin,
    totalVisitMin,
  };
}

// ── Format Helpers ──

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}` : `${m}min`;
}

export function getReasonBadgeStyle(reason: string): { className: string } {
  switch (reason) {
    case 'En retard':
      return { className: 'bg-destructive/15 text-destructive' };
    case 'Jamais visité':
      return { className: 'bg-destructive/10 text-destructive' };
    case 'Fort potentiel':
    case 'Priorité A':
      return { className: 'bg-primary/15 text-primary' };
    case 'Prospect qualifié':
      return { className: 'bg-accent/15 text-accent' };
    case 'Sur le trajet':
      return { className: 'bg-muted text-muted-foreground' };
    case 'À visiter bientôt':
      return { className: 'bg-warning/15 text-warning' };
    case 'Hors zone':
      return { className: 'bg-warning/10 text-warning border border-warning/20' };
    case 'Magasin prioritaire':
      return { className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' };
    case 'Atelier prioritaire':
      return { className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' };
    case 'Mixte prioritaire':
      return { className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' };
    default:
      return { className: 'bg-muted text-muted-foreground' };
  }
}

/**
 * Returns a compact label + badge style for a customer's relationship type.
 */
export function getRelationshipBadge(
  relationshipType: string | null | undefined,
): { label: string; className: string } | null {
  switch (relationshipType) {
    case 'magasin':
      return { label: 'Magasin', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' };
    case 'atelier':
      return { label: 'Atelier', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' };
    case 'mixte':
      return { label: 'Mixte', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' };
    default:
      return null;
  }
}

