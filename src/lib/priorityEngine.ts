/**
 * Visit Priority Engine
 * Combines potential, underperformance, visit recency, and proximity
 * to compute an actionable priority score for each customer.
 */

import type { CustomerPerformance } from './performanceUtils';

export type PriorityLevel = 'high' | 'medium' | 'low';

export interface PriorityResult {
  score: number; // 0-100
  level: PriorityLevel;
  reasons: string[];
}

export interface PriorityConfig {
  label: string;
  emoji: string;
  color: string;
  bgColor: string;
}

export const PRIORITY_CONFIGS: Record<PriorityLevel, PriorityConfig> = {
  high:   { label: 'Priorité haute',   emoji: '🔴', color: 'text-destructive',      bgColor: 'bg-destructive/15' },
  medium: { label: 'Priorité moyenne', emoji: '🟠', color: 'text-warning',          bgColor: 'bg-warning/15' },
  low:    { label: 'Priorité faible',  emoji: '⚪', color: 'text-muted-foreground', bgColor: 'bg-muted' },
};

function daysSinceDate(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function getVisitDelayThreshold(frequency: string | null): number {
  const thresholds: Record<string, number> = {
    hebdomadaire: 10, bimensuelle: 18, mensuelle: 40,
    trimestrielle: 100, semestrielle: 200, annuelle: 400,
    weekly: 10, biweekly: 18, monthly: 40,
    multiple_per_week: 7,
  };
  return thresholds[frequency || 'mensuelle'] || 40;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Core priority scoring function.
 * Weights: Potential 35%, Underperformance 30%, Visit delay 20%, Distance 15%
 */
export function computeVisitPriority(
  perf: CustomerPerformance,
  lastVisitDate: string | null,
  visitFrequency: string | null,
  userLat?: number | null,
  userLng?: number | null,
  customerLat?: number | null,
  customerLng?: number | null,
): PriorityResult {
  const reasons: string[] = [];
  let potentialWeight = 0;
  let underperformanceWeight = 0;
  let visitDelayWeight = 0;
  let distanceWeight = 0;

  // A. Potential revenue weight (0-35)
  const mp = perf.monthlyPotential;
  if (mp >= 5000) { potentialWeight = 35; reasons.push('Fort potentiel'); }
  else if (mp >= 3000) { potentialWeight = 28; }
  else if (mp >= 2000) { potentialWeight = 20; }
  else if (mp >= 1000) { potentialWeight = 12; }
  else if (mp > 0) { potentialWeight = 5; }

  // B. Underperformance weight (0-30)
  const effectiveCA = perf.caM1 ?? perf.latestKnownCA;
  if (effectiveCA !== null && mp > 0) {
    const coverage = (effectiveCA / mp) * 100;
    if (coverage < 20) { underperformanceWeight = 30; reasons.push('CA très en dessous du potentiel'); }
    else if (coverage < 40) { underperformanceWeight = 25; reasons.push('CA sous-exploité'); }
    else if (coverage < 60) { underperformanceWeight = 18; }
    else if (coverage < 80) { underperformanceWeight = 10; }
    else { underperformanceWeight = 2; }
  } else if (mp > 2000 && effectiveCA === null) {
    // High potential with no revenue data = opportunity
    underperformanceWeight = 22;
    reasons.push('Aucun CA connu');
  }

  // C. Visit recency weight (0-20)
  const daysSince = daysSinceDate(lastVisitDate);
  const threshold = getVisitDelayThreshold(visitFrequency);
  if (daysSince === null) {
    visitDelayWeight = 20;
    reasons.push('Jamais visité');
  } else if (daysSince > threshold * 2) {
    visitDelayWeight = 20;
    reasons.push('Visite très en retard');
  } else if (daysSince > threshold) {
    visitDelayWeight = 16;
    reasons.push('Visite en retard');
  } else if (daysSince > threshold * 0.7) {
    visitDelayWeight = 10;
  } else {
    visitDelayWeight = 2;
  }

  // D. Distance weight (0-15) — closer = higher score
  if (userLat != null && userLng != null && customerLat != null && customerLng != null) {
    const dist = haversineKm(userLat, userLng, customerLat, customerLng);
    if (dist <= 10) { distanceWeight = 15; reasons.push('Proche de votre position'); }
    else if (dist <= 25) { distanceWeight = 12; }
    else if (dist <= 50) { distanceWeight = 8; }
    else if (dist <= 100) { distanceWeight = 4; }
    else { distanceWeight = 1; }
  } else {
    // No location data — neutral
    distanceWeight = 7;
  }

  const score = potentialWeight + underperformanceWeight + visitDelayWeight + distanceWeight;

  let level: PriorityLevel;
  if (score >= 55) level = 'high';
  else if (score >= 30) level = 'medium';
  else level = 'low';

  return { score, level, reasons };
}

/** Get priority level from score alone */
export function getPriorityLevel(score: number): PriorityLevel {
  if (score >= 55) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}
