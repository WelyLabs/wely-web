import { HttpErrorResponse } from '@angular/common/http';

/** wely-events' refusal of a new event whose date is already behind. */
export const EVENT_IN_PAST_CODE = 'EVT-BUS-038';
export const EVENT_IN_PAST_MESSAGE = 'Cette date est déjà passée : choisis un moment à venir.';

/** How far behind the clock a start may be, as wely-events allows: the time spent on the form. */
const START_GRACE_MS = 5 * 60_000;

/** A start wely-events would refuse as past. */
export function startsInPast(start: Date, now = Date.now()): boolean {
  return start.getTime() < now - START_GRACE_MS;
}

/** Whether the request failed because its date is past. */
export function isEventInPast(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.error?.code === EVENT_IN_PAST_CODE;
}
