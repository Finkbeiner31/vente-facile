/**
 * Revenue display utilities
 * Primary: monthly potential | Secondary: annual potential
 */

export function formatMonthly(annual: number): string {
  const monthly = Math.round(annual / 12);
  if (monthly >= 1000) return `${(monthly / 1000).toFixed(1).replace('.0', '')}k€/mois`;
  return `${monthly}€/mois`;
}

export function formatAnnual(annual: number): string {
  if (annual >= 1000) return `${(annual / 1000).toFixed(0)}k€/an`;
  return `${annual}€/an`;
}

export type RevenueTier = 'high' | 'medium' | 'low';

export function getRevenueTier(annual: number): RevenueTier {
  const monthly = annual / 12;
  if (monthly >= 5000) return 'high';
  if (monthly >= 2000) return 'medium';
  return 'low';
}

export function getRevenueTierColor(tier: RevenueTier): string {
  switch (tier) {
    case 'high': return 'text-destructive';
    case 'medium': return 'text-accent';
    case 'low': return 'text-muted-foreground';
  }
}

export function getRevenueTierBg(tier: RevenueTier): string {
  switch (tier) {
    case 'high': return 'bg-destructive/10';
    case 'medium': return 'bg-accent/10';
    case 'low': return 'bg-muted';
  }
}
