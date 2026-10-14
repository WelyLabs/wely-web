import { Period, usefulHours } from '../../components/calendar-overlay/overlay-layout';

/** How long a proposed outing lasts. */
export const OUTING_MS = 2 * 3_600_000;
/** A proposed outing starts between these hours, local time. */
const EVENING_FROM_HOUR = 18;
const EVENING_TO_HOUR = 21;
/** How many slots « Proposer une sortie » puts in the poll. */
export const MAX_PROPOSED_SLOTS = 3;
const HALF_HOUR_MS = 30 * 60_000;
/** Free time shorter than this is not worth showing. */
export const MIN_SHOWN_FREE_MS = 30 * 60_000;

/** What the friend page hands the calendar through `history.state`. */
export interface OutingProposal {
  proposeSlots: Period[];
  proposeWith: string;
}

function atHour(day: Date, hour: number): Date {
  const date = new Date(day);
  date.setHours(hour, 0, 0, 0);
  return date;
}

/** The next half hour, or the date itself when it is on one. */
export function roundUpToHalfHour(date: Date): Date {
  const extra = (date.getMinutes() % 30) * 60_000 + date.getSeconds() * 1000 + date.getMilliseconds();
  return extra === 0 ? new Date(date) : new Date(date.getTime() - extra + HALF_HOUR_MS);
}

/** Free ranges from now on, cut to each day's useful hours, in order. */
export function freeWithinUsefulHours(ranges: readonly Period[], now: Date): Period[] {
  const pieces: Period[] = [];
  for (const range of ranges) {
    const from = range.start > now ? range.start : now;
    for (let day = atHour(from, 0); day < range.end; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
      const window = usefulHours(day);
      const start = from > window.start ? from : window.start;
      const end = range.end < window.end ? range.end : window.end;
      if (start < end) {
        pieces.push({ start, end });
      }
    }
  }
  return pieces.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Up to three 2-hour evening slots, one per day, starting between 18:00 and 21:00 on the half
 * hour. Without any, the first free stretch within useful hours; without that, none.
 */
export function pickOutingSlots(ranges: readonly Period[], now: Date): Period[] {
  const pieces = freeWithinUsefulHours(ranges, now);
  const slots: Period[] = [];
  const days = new Set<string>();
  for (const piece of pieces) {
    const evening = atHour(piece.start, EVENING_FROM_HOUR);
    const start = roundUpToHalfHour(piece.start > evening ? piece.start : evening);
    const end = new Date(start.getTime() + OUTING_MS);
    const day = piece.start.toDateString();
    if (start <= atHour(piece.start, EVENING_TO_HOUR) && end <= piece.end && !days.has(day)) {
      slots.push({ start, end });
      days.add(day);
      if (slots.length === MAX_PROPOSED_SLOTS) {
        break;
      }
    }
  }
  if (slots.length > 0) {
    return slots;
  }
  const first = pieces.find(piece => roundUpToHalfHour(piece.start) < piece.end);
  if (!first) {
    return [];
  }
  const start = roundUpToHalfHour(first.start);
  const end = Math.min(start.getTime() + OUTING_MS, first.end.getTime());
  return [{ start, end: new Date(end) }];
}

function toDate(value: unknown): Date | null {
  const date = value instanceof Date ? value : typeof value === 'string' || typeof value === 'number' ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/** The proposal in a `history.state`, or null when there is none; unreadable slots are dropped. */
export function readOutingProposal(state: unknown): OutingProposal | null {
  if (!state || typeof state !== 'object') {
    return null;
  }
  const { proposeSlots, proposeWith } = state as Record<string, unknown>;
  if (!Array.isArray(proposeSlots) || typeof proposeWith !== 'string') {
    return null;
  }
  const slots = proposeSlots.flatMap((slot: unknown) => {
    if (!slot || typeof slot !== 'object') {
      return [];
    }
    const { start, end } = slot as Record<string, unknown>;
    const from = toDate(start);
    const to = toDate(end);
    return from && to && from < to ? [{ start: from, end: to }] : [];
  });
  return { proposeSlots: slots, proposeWith };
}
