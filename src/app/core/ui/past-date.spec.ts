import { HttpErrorResponse } from '@angular/common/http';
import { describe, it, expect } from 'vitest';
import { EVENT_IN_PAST_CODE, isEventInPast, startsInPast } from './past-date';

describe('past-date', () => {
  const now = new Date('2026-10-19T14:00:00Z').getTime();

  it('startsInPast_shouldRefuseAStartMoreThanFiveMinutesBehind', () => {
    expect(startsInPast(new Date('2026-10-19T13:54:00Z'), now)).toBe(true);
    expect(startsInPast(new Date('2026-10-18T20:00:00Z'), now)).toBe(true);
  });

  it('startsInPast_shouldAcceptAStartJustBehindOrAhead', () => {
    expect(startsInPast(new Date('2026-10-19T13:56:00Z'), now)).toBe(false);
    expect(startsInPast(new Date('2026-10-20T09:00:00Z'), now)).toBe(false);
  });

  it('isEventInPast_shouldRecognizeOnlyThePastDateRefusal', () => {
    expect(isEventInPast(new HttpErrorResponse({ status: 400, error: { code: EVENT_IN_PAST_CODE } }))).toBe(true);
    expect(isEventInPast(new HttpErrorResponse({ status: 400, error: { code: 'EVT-BUS-014' } }))).toBe(false);
    expect(isEventInPast(new Error('boom'))).toBe(false);
  });
});
