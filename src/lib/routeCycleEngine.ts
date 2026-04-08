/**
 * 3-week route cycle engine
 * Generates daily visit plans based on visit frequency, priority, and geography.
 */

export type VisitFrequency = 'multiple_per_week' | 'weekly' | 'biweekly' | 'triweekly';

export const VISIT_FREQUENCY_OPTIONS: { value: VisitFrequency; label: string; visitsPerCycle: number }[] = [
  { value: 'multiple_per_week', label: 'Plusieurs fois / semaine', visitsPerCycle: 9 },
  { value: 'weekly', label: '1 fois / semaine', visitsPerCycle: 3 },
  { value: 'biweekly', label: 'Toutes les 2 semaines', visitsPerCycle: 2 },
  { value: 'triweekly', label: 'Toutes les 3 semaines', visitsPerCycle: 1 },
];

export interface CustomerForRouting {
  id: string;
  company_name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  visit_frequency: string | null;
  number_of_vehicles: number;
  annual_revenue_potential: number;
  latitude: number | null;
  longitude: number | null;
  sales_potential: string | null;
}

export interface PlannedVisit {
  customer: CustomerForRouting;
  priority: number; // higher = more important
  dayIndex: number; // 0-14 (15 working days in 3 weeks)
}

function getVisitsPerCycle(freq: string | null): number {
  const found = VISIT_FREQUENCY_OPTIONS.find(o => o.value === freq);
  return found?.visitsPerCycle ?? 1;
}

function getPriorityScore(customer: CustomerForRouting): number {
  const revScore = Math.min((customer.annual_revenue_potential || 0) / 1000, 100);
  const potentialBonus = customer.sales_potential === 'A' ? 30 : customer.sales_potential === 'B' ? 15 : 0;
  return revScore + potentialBonus;
}

/**
 * Generate a 3-week (15 working days) cycle of visits.
 * Each day targets 8-12 visits.
 */
export function generateRouteCycle(
  customers: CustomerForRouting[],
  targetPerDay: number = 10
): PlannedVisit[][] {
  // Build a pool of visits needed
  const pool: { customer: CustomerForRouting; priority: number }[] = [];

  for (const c of customers) {
    const visits = getVisitsPerCycle(c.visit_frequency);
    const priority = getPriorityScore(c);
    for (let i = 0; i < visits; i++) {
      pool.push({ customer: c, priority });
    }
  }

  // Sort by priority descending
  pool.sort((a, b) => b.priority - a.priority);

  // Distribute across 15 days
  const days: PlannedVisit[][] = Array.from({ length: 15 }, () => []);

  for (const item of pool) {
    // Find the day with fewest visits (and under target)
    let bestDay = 0;
    let bestCount = Infinity;
    for (let d = 0; d < 15; d++) {
      if (days[d].length < bestCount) {
        bestCount = days[d].length;
        bestDay = d;
      }
    }
    // Skip if all days full
    if (days[bestDay].length >= 12) continue;

    days[bestDay].push({
      customer: item.customer,
      priority: item.priority,
      dayIndex: bestDay,
    });
  }

  // Sort each day by priority
  for (const day of days) {
    day.sort((a, b) => b.priority - a.priority);
  }

  return days;
}

export function getWorkingDate(cycleStartDate: Date, dayIndex: number): Date {
  const date = new Date(cycleStartDate);
  let workingDays = 0;
  while (workingDays < dayIndex) {
    date.setDate(date.getDate() + 1);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) workingDays++;
  }
  return date;
}

export function getDayLabel(dayIndex: number): string {
  const weekNum = Math.floor(dayIndex / 5) + 1;
  const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
  const dayInWeek = dayIndex % 5;
  return `S${weekNum} - ${dayNames[dayInWeek]}`;
}
