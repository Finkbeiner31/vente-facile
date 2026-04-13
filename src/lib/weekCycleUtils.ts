/**
 * Shared week-cycle utilities for consistent 4-week (S1–S4) planning logic.
 */

/**
 * Get current week number in 4-week cycle (0-3).
 * Uses ISO week number % 4 for consistency.
 */
export function getCurrentWeekNumber(): number {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(
    ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay()) / 7
  );
  return weekNum % 4;
}

/**
 * Get today's day of week (1=Mon ... 5=Fri, 6=Sat, 7=Sun).
 */
export function getTodayDow(): number {
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}

/**
 * Check if today is a weekday (Mon-Fri).
 */
export function isWeekday(): boolean {
  return getTodayDow() <= 5;
}
