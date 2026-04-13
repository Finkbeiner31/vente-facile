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
export type TypeFilter = 'tous' | 'clients' | 'prospects';

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

export interface OptimizedRoute {
  customers: ScoredCustomer[];
  totalDistanceKm: number;
  estimatedDurationMin: number;
  totalTravelMin: number;
  totalVisitMin: number;
}

export interface OptimizationConfig {
  visitTarget: number;
  strategy: RouteStrategy;
  zoneLogic: ZoneLogic;
  typeFilter: TypeFilter;
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

function getVisitDuration(c: OptCustomer): number {
  if (c.visit_duration_minutes && c.visit_duration_minutes > 0) return c.visit_duration_minutes;
  const isProspect = c.customer_type === 'prospect' || c.customer_type === 'prospect_qualifie';
  return isProspect ? DEFAULT_VISIT_DURATION_PROSPECT : DEFAULT_VISIT_DURATION_CLIENT;
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

  // D. Relationship type bonus (0-10)
  if (c.relationship_type === 'mixte') {
    relationshipScore = 5;
  }

  const score = urgencyScore + businessScore + routeScore + relationshipScore;
  return { score: Math.round(score), reasons };
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

    // Exclude recently visited
    if (config.excludeRecentDays != null) {
      const days = daysSince(c.last_visit_date);
      if (days !== null && days <= config.excludeRecentDays) continue;
    }

    // Zone logic
    const inZone = zoneCustomerIds.has(c.id);
    let isOutsideZone = false;

    if (!inZone) {
      if (config.zoneLogic === 'strict') continue;

      if (config.zoneLogic === 'tolerance') {
        // Check distance to zone center (approximate via departure as zone proxy)
        const dist = haversineKm(config.departureLat, config.departureLng, c.latitude, c.longitude);
        if (dist > ZONE_TOLERANCE_KM * 3) continue; // rough filter — real check is vs zone boundary
        isOutsideZone = true;
      }

      if (config.zoneLogic === 'route') {
        const onRoute = isOnRoute(
          c.latitude, c.longitude,
          config.departureLat, config.departureLng,
          config.arrivalLat, config.arrivalLng,
          ROUTE_CORRIDOR_KM,
        );
        if (!onRoute) continue;
        isOutsideZone = true;
      }
    }

    const distanceFromUser = haversineKm(config.departureLat, config.departureLng, c.latitude, c.longitude);
    const { score, reasons } = computeTourneePriority(
      c, config.departureLat, config.departureLng, config.arrivalLat, config.arrivalLng,
    );
    const visitDuration = getVisitDuration(c);

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
    default:
      return { className: 'bg-muted text-muted-foreground' };
  }
}
