/**
 * Revenue performance analysis utilities
 * Computes coverage, trend, performance status, alerts, and priority score
 */

export type PerformanceStatus = 'optimise' | 'a_developper' | 'sous_exploite' | 'no_data';
export type RevenueTrend = 'up' | 'down' | 'stable' | 'unknown';

export interface RevenueData {
  month: number;
  year: number;
  monthly_revenue: number;
}

export interface CustomerPerformance {
  monthlyPotential: number;
  caM1: number | null;
  caM2: number | null;
  caM3: number | null;
  coverageRate: number; // 0-100
  gap: number;
  trend: RevenueTrend;
  status: PerformanceStatus;
  priorityScore: number;
  alerts: PerformanceAlert[];
  recentMonths: RevenueData[];
}

export interface PerformanceAlert {
  type: 'high_priority' | 'declining' | 'growing';
  level: 'danger' | 'warning' | 'success';
  label: string;
  icon: string;
}

/** Get the last N months (year, month) pairs ending at current month - 1 */
function getLastMonths(count: number): { month: number; year: number }[] {
  const now = new Date();
  const results: { month: number; year: number }[] = [];
  let m = now.getMonth(); // 0-indexed, so current month is getMonth()
  let y = now.getFullYear();
  // M-1 = previous month
  for (let i = 0; i < count; i++) {
    m--;
    if (m < 0) { m = 11; y--; }
    results.push({ month: m + 1, year: y }); // 1-indexed
  }
  return results;
}

function findRevenue(data: RevenueData[], month: number, year: number): number | null {
  const found = data.find(d => d.month === month && d.year === year);
  return found ? Number(found.monthly_revenue) : null;
}

export function computeTrend(values: (number | null)[]): RevenueTrend {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length < 2) return 'unknown';
  // Compare first to last (most recent is first)
  const latest = valid[0];
  const older = valid[valid.length - 1];
  const pctChange = older > 0 ? (latest - older) / older : 0;
  if (pctChange > 0.05) return 'up';
  if (pctChange < -0.05) return 'down';
  return 'stable';
}

export function getPerformanceStatus(coverageRate: number, hasData: boolean): PerformanceStatus {
  if (!hasData) return 'no_data';
  if (coverageRate >= 80) return 'optimise';
  if (coverageRate >= 40) return 'a_developper';
  return 'sous_exploite';
}

export function getStatusConfig(status: PerformanceStatus): { label: string; color: string; bgColor: string; emoji: string } {
  switch (status) {
    case 'optimise': return { label: 'Optimisé', color: 'text-accent', bgColor: 'bg-accent/15', emoji: '🟢' };
    case 'a_developper': return { label: 'À développer', color: 'text-warning', bgColor: 'bg-warning/15', emoji: '🟡' };
    case 'sous_exploite': return { label: 'Sous-exploité', color: 'text-destructive', bgColor: 'bg-destructive/15', emoji: '🔴' };
    case 'no_data': return { label: 'Pas de données', color: 'text-muted-foreground', bgColor: 'bg-muted', emoji: '⚪' };
  }
}

export function computeAlerts(monthlyPotential: number, coverageRate: number, trend: RevenueTrend, hasData: boolean): PerformanceAlert[] {
  const alerts: PerformanceAlert[] = [];
  if (!hasData) return alerts;

  if (monthlyPotential > 3000 && coverageRate < 40) {
    alerts.push({ type: 'high_priority', level: 'danger', label: '⚠️ Client à fort potentiel non exploité', icon: 'alert' });
  }
  if (trend === 'down') {
    alerts.push({ type: 'declining', level: 'warning', label: '📉 Baisse d\'activité', icon: 'trending-down' });
  }
  if (trend === 'up') {
    alerts.push({ type: 'growing', level: 'success', label: '📈 En progression', icon: 'trending-up' });
  }
  return alerts;
}

export function getActionSuggestions(status: PerformanceStatus): { label: string; description: string }[] {
  switch (status) {
    case 'sous_exploite':
      return [
        { label: 'Planifier visite', description: 'Programmer une visite commerciale prioritaire' },
        { label: 'Relance commerciale', description: 'Contacter le client pour comprendre les freins' },
        { label: 'Proposer offre / promo', description: 'Soumettre une offre promotionnelle ciblée' },
      ];
    case 'a_developper':
      return [
        { label: 'Proposition complémentaire', description: 'Proposer des produits/services additionnels' },
        { label: 'Upsell', description: 'Identifier les opportunités de montée en gamme' },
        { label: 'Vérification satisfaction', description: 'S\'assurer de la satisfaction client' },
      ];
    case 'optimise':
      return [
        { label: 'Fidélisation', description: 'Renforcer la relation et la fidélité' },
        { label: 'Demande recommandation', description: 'Solliciter des recommandations clients' },
        { label: 'Suivi standard', description: 'Maintenir le rythme de visites habituel' },
      ];
    default:
      return [];
  }
}

/** Main computation function */
export function analyzeCustomerPerformance(
  annualRevenuePotential: number,
  revenueHistory: RevenueData[]
): CustomerPerformance {
  const monthlyPotential = annualRevenuePotential / 12;
  const periods = getLastMonths(6);

  const caM1 = periods[0] ? findRevenue(revenueHistory, periods[0].month, periods[0].year) : null;
  const caM2 = periods[1] ? findRevenue(revenueHistory, periods[1].month, periods[1].year) : null;
  const caM3 = periods[2] ? findRevenue(revenueHistory, periods[2].month, periods[2].year) : null;

  const hasData = caM1 !== null;
  const coverageRate = hasData && monthlyPotential > 0 ? (caM1! / monthlyPotential) * 100 : 0;
  const gap = hasData ? monthlyPotential - caM1! : monthlyPotential;
  const trend = computeTrend([caM1, caM2, caM3]);
  const status = getPerformanceStatus(coverageRate, hasData);
  const alerts = computeAlerts(monthlyPotential, coverageRate, trend, hasData);

  // Priority score: higher = needs more attention
  const priorityScore = hasData
    ? Math.round(monthlyPotential * (1 - coverageRate / 100))
    : 0;

  // Recent months data for chart
  const recentMonths = periods.map(p => {
    const rev = findRevenue(revenueHistory, p.month, p.year);
    return { month: p.month, year: p.year, monthly_revenue: rev ?? 0 };
  }).reverse();

  return {
    monthlyPotential,
    caM1, caM2, caM3,
    coverageRate,
    gap,
    trend,
    status,
    priorityScore,
    alerts,
    recentMonths,
  };
}
