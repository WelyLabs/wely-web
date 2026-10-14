import { describe, it, expect } from 'vitest';
import { rangeLabel, shiftLabel } from './schedule-labels';

const at = (iso: string) => new Date(iso);
const time = (date: Date) => date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

describe('schedule labels', () => {
  it('rangeLabel_shouldGiveTheHoursAlone_onTheReferenceDay', () => {
    const start = at('2026-10-16T14:00:00');
    const end = at('2026-10-16T16:00:00');

    expect(rangeLabel(start, end)).toBe(`${time(start)} – ${time(end)}`);
  });

  it('rangeLabel_shouldGiveTheDayToo_onAnotherDay', () => {
    const label = rangeLabel(at('2026-10-17T14:00:00'), at('2026-10-17T16:00:00'), at('2026-10-16T14:00:00'));

    expect(label).toMatch(/^sam\. 17 oct\. · /);
  });

  it('rangeLabel_shouldGiveBothDays_whenTheRangeSpansSeveral', () => {
    const label = rangeLabel(at('2026-10-16T22:00:00'), at('2026-10-17T02:00:00'));

    expect(label).toContain('ven. 16 oct.');
    expect(label).toContain('→ sam. 17 oct.');
  });

  it('shiftLabel_shouldWordAMoveLaterOrEarlier', () => {
    const from = at('2026-10-16T14:00:00');

    expect(shiftLabel(from, at('2026-10-16T15:00:00'))).toBe('1 h plus tard');
    expect(shiftLabel(from, at('2026-10-16T13:30:00'))).toBe('30 min plus tôt');
    expect(shiftLabel(from, at('2026-10-16T16:30:00'))).toBe('2 h 30 plus tard');
    expect(shiftLabel(from, at('2026-10-16T13:55:00'))).toBe('5 min plus tôt');
  });
});
