/**
 * Shared week-cycle utilities for consistent 4-week (S1–S4) planning logic.
 * The active week is computed from a configurable reference date (start of S1).
 */

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/** Default fallback if no admin setting is configured (Mon 13 Apr 2026). */
export const DEFAULT_CYCLE_START_DATE = '2026-04-13';

/** Parse a YYYY-MM-DD string as a local-midnight Date. */
export function parseCycleStart(dateStr: string | null | undefined): Date {
  const raw = (dateStr || DEFAULT_CYCLE_START_DATE).trim();
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return parseCycleStart(DEFAULT_CYCLE_START_DATE);
  return new Date(y, m - 1, d);
}

/** Snap a date to the Monday of its ISO week (Mon=1 .. Sun=7). */
export function snapToMonday(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = out.getDay(); // 0=Sun ... 6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  out.setDate(out.getDate() + diff);
  return out;
}

/** True if the given YYYY-MM-DD is a Monday. */
export function isMonday(dateStr: string | null | undefined): boolean {
  const d = parseCycleStart(dateStr);
  return d.getDay() === 1;
}

/**
 * Compute the active week index (0..3 → S1..S4) from now and the reference date.
 * If now is before the reference date, returns 0 (S1).
 */
export function getCurrentWeekNumber(cycleStart?: string | null): number {
  const ref = snapToMonday(parseCycleStart(cycleStart));
  const todayMon = snapToMonday(new Date());
  const weeksElapsed = Math.floor((todayMon.getTime() - ref.getTime()) / MS_PER_WEEK);
  if (weeksElapsed < 0) return 0;
  return weeksElapsed % 4;
}

/** Today's day of week (1=Mon ... 5=Fri, 6=Sat, 7=Sun). */
export function getTodayDow(): number {
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}

/** True if today is a weekday (Mon-Fri). */
export function isWeekday(): boolean {
  return getTodayDow() <= 5;
}

/**
 * Get the Monday date for a given cycle week index (0..3) within the cycle
 * containing today. Useful to label S1..S4 with real calendar dates.
 */
export function getWeekStartDate(weekIndex: number, cycleStart?: string | null): Date {
  const ref = snapToMonday(parseCycleStart(cycleStart));
  const todayMon = snapToMonday(new Date());
  const weeksElapsed = Math.max(0, Math.floor((todayMon.getTime() - ref.getTime()) / MS_PER_WEEK));
  const cycleIndex = Math.floor(weeksElapsed / 4); // which 4-week cycle we're in
  const cycleStartMon = new Date(ref);
  cycleStartMon.setDate(cycleStartMon.getDate() + cycleIndex * 28);
  const weekStart = new Date(cycleStartMon);
  weekStart.setDate(weekStart.getDate() + weekIndex * 7);
  return weekStart;
}

/** Format a compact "13–17 avr." style French range for Mon..Fri of the given week. */
export function formatWeekRange(weekIndex: number, cycleStart?: string | null): string {
  const start = getWeekStartDate(weekIndex, cycleStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 4); // Fri

  const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric' });
  const fmtDayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  const showYear = end.getFullYear() !== new Date().getFullYear();

  const left = sameMonth ? fmtDay.format(start) : fmtDayMonth.format(start);
  const right = fmtDayMonth.format(end);
  const yearSuffix = showYear ? ` ${end.getFullYear()}` : '';
  return sameYear ? `${left}–${right}${yearSuffix}` : `${fmtDayMonth.format(start)} ${start.getFullYear()} – ${right} ${end.getFullYear()}`;
}
