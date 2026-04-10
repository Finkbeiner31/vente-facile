/**
 * Visit Frequency Utilities
 * Compute visit status based on frequency and last visit date.
 */

export type VisitFrequency = 'hebdomadaire' | 'toutes_les_2_semaines' | 'mensuel' | 'trimestriel' | 'ponctuel';
export type VisitStatus = 'a_jour' | 'a_visiter' | 'en_retard';
export type PreferredDay = 'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi' | 'aucun';

export const VISIT_FREQUENCIES: { value: VisitFrequency; label: string }[] = [
  { value: 'hebdomadaire', label: 'Hebdomadaire' },
  { value: 'toutes_les_2_semaines', label: 'Toutes les 2 semaines' },
  { value: 'mensuel', label: 'Mensuel' },
  { value: 'trimestriel', label: 'Trimestriel' },
  { value: 'ponctuel', label: 'Ponctuel / à la demande' },
];

export const PREFERRED_DAYS: { value: PreferredDay; label: string }[] = [
  { value: 'lundi', label: 'Lundi' },
  { value: 'mardi', label: 'Mardi' },
  { value: 'mercredi', label: 'Mercredi' },
  { value: 'jeudi', label: 'Jeudi' },
  { value: 'vendredi', label: 'Vendredi' },
  { value: 'aucun', label: 'Aucun' },
];

/** Interval in days for each frequency */
function getIntervalDays(frequency: VisitFrequency | string | null): number | null {
  const map: Record<string, number> = {
    hebdomadaire: 7,
    toutes_les_2_semaines: 14,
    mensuel: 30,
    trimestriel: 90,
    // Legacy values
    mensuelle: 30,
    bimensuelle: 14,
    trimestrielle: 90,
    weekly: 7,
    biweekly: 14,
    monthly: 30,
  };
  if (!frequency || frequency === 'ponctuel') return null;
  return map[frequency] || null;
}

/** Default frequency based on customer type */
export function getDefaultFrequency(customerType: string): VisitFrequency {
  switch (customerType) {
    case 'client_actif': return 'mensuel';
    case 'prospect_qualifie': return 'mensuel';
    case 'prospect': return 'trimestriel';
    case 'client_inactif': return 'trimestriel';
    default: return 'trimestriel';
  }
}

/** Calculate days since last visit */
function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export interface VisitStatusResult {
  status: VisitStatus;
  label: string;
  color: string;
  bgColor: string;
  daysSinceVisit: number | null;
  daysUntilDue: number | null;
}

/** Compute visit status from frequency and last visit date */
export function computeVisitStatus(
  frequency: string | null,
  lastVisitDate: string | null,
): VisitStatusResult {
  const days = daysSince(lastVisitDate);
  const interval = getIntervalDays(frequency);

  // Ponctuel or unknown interval → always "à jour"
  if (interval === null) {
    return {
      status: 'a_jour',
      label: 'À jour',
      color: 'text-accent',
      bgColor: 'bg-accent/15',
      daysSinceVisit: days,
      daysUntilDue: null,
    };
  }

  // Never visited
  if (days === null) {
    return {
      status: 'en_retard',
      label: 'En retard',
      color: 'text-destructive',
      bgColor: 'bg-destructive/15',
      daysSinceVisit: null,
      daysUntilDue: 0,
    };
  }

  const daysUntilDue = interval - days;

  if (days > interval) {
    return {
      status: 'en_retard',
      label: 'En retard',
      color: 'text-destructive',
      bgColor: 'bg-destructive/15',
      daysSinceVisit: days,
      daysUntilDue,
    };
  }

  // Due within 20% of the interval
  const warningThreshold = interval * 0.8;
  if (days >= warningThreshold) {
    return {
      status: 'a_visiter',
      label: 'À visiter',
      color: 'text-warning',
      bgColor: 'bg-warning/15',
      daysSinceVisit: days,
      daysUntilDue,
    };
  }

  return {
    status: 'a_jour',
    label: 'À jour',
    color: 'text-accent',
    bgColor: 'bg-accent/15',
    daysSinceVisit: days,
    daysUntilDue,
  };
}

/** Priority score boost for visit status (used in optimizer) */
export function getVisitStatusBoost(visitStatus: VisitStatus): number {
  switch (visitStatus) {
    case 'en_retard': return 40;
    case 'a_visiter': return 20;
    case 'a_jour': return 0;
  }
}
