import { describe, expect, it } from 'vitest';
import { allDayLocalRange, allDayWireRange, daysCovered } from './all-day';

describe('all-day', () => {
    it('allDayWireRange_shouldSendUtcMidnights_theEndExclusive', () => {
        const range = allDayWireRange(new Date(2026, 2, 12, 18, 30), new Date(2026, 2, 12, 19));

        expect(range.startDate.toISOString()).toBe('2026-03-12T00:00:00.000Z');
        expect(range.endDate.toISOString()).toBe('2026-03-13T00:00:00.000Z');
    });

    it('allDayWireRange_shouldIncludeTheLastDay_andNeverEndBeforeTheFirst', () => {
        expect(allDayWireRange(new Date(2026, 2, 12), new Date(2026, 2, 14)).endDate.toISOString()).toBe('2026-03-15T00:00:00.000Z');
        expect(allDayWireRange(new Date(2026, 2, 12), new Date(2026, 2, 10)).endDate.toISOString()).toBe('2026-03-13T00:00:00.000Z');
    });

    it('allDayLocalRange_shouldKeepTheUtcDates_asLocalMidnights', () => {
        const { start, end } = allDayLocalRange(new Date('2026-03-12T00:00:00Z'), new Date('2026-03-14T00:00:00Z'));

        expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()]).toEqual([2026, 2, 12, 0]);
        expect([end.getMonth(), end.getDate()]).toEqual([2, 14]);
    });

    it('allDayLocalRange_shouldLastAtLeastOneDay', () => {
        const instant = new Date('2026-03-12T00:00:00Z');
        const { end } = allDayLocalRange(instant, instant);

        expect(end.getDate()).toBe(13);
    });

    it('daysCovered_shouldListEachDay_theEndExcluded', () => {
        expect(daysCovered(new Date(2026, 2, 30), new Date(2026, 3, 2)).map(day => day.getDate())).toEqual([30, 31, 1]);
        expect(daysCovered(new Date(2026, 2, 12), new Date(2026, 2, 12))).toEqual([]);
    });
});
