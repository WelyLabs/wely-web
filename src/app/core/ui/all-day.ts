/**
 * All-day events travel as UTC midnights: the start of the first day and the start of the day
 * after the last one (exclusive). They are drawn by those UTC calendar dates, whatever the zone.
 */

const DAY_MS = 86_400_000;

/** The wire range of an all-day event from its first to its last local day, both included. */
export function allDayWireRange(firstDay: Date, lastDay: Date): { startDate: Date; endDate: Date } {
  const startDate = new Date(Date.UTC(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate()));
  const last = lastDay < firstDay ? firstDay : lastDay;
  const endDate = new Date(Date.UTC(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  return { startDate, endDate };
}

/** The local midnights of the UTC days an all-day event covers: its first day, and the day after its last. */
export function allDayLocalRange(start: Date, end: Date): { start: Date; end: Date } {
  const first = new Date(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  // At least one day, even if the end came back equal to the start.
  const endMs = Math.max(end.getTime(), start.getTime() + DAY_MS);
  const endUtc = new Date(endMs);
  const after = new Date(endUtc.getUTCFullYear(), endUtc.getUTCMonth(), endUtc.getUTCDate());
  return { start: first, end: after };
}

/** Each local day an all-day event covers, given its local range from {@link allDayLocalRange}. */
export function daysCovered(start: Date, endExclusive: Date): Date[] {
  const days: Date[] = [];
  for (const day = new Date(start); day < endExclusive; day.setDate(day.getDate() + 1)) {
    days.push(new Date(day));
  }
  return days;
}
