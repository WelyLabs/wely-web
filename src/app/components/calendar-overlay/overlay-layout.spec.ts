import { describe, it, expect } from 'vitest';
import { FriendLane, layoutDay } from './overlay-layout';

describe('layoutDay', () => {
    const HOUR = 80;
    const wednesday = new Date(2026, 9, 14);
    const at = (day: number, hour: number) => new Date(2026, 9, day, hour);

    const lane = (friendName: string, color: string, ...periods: [Date, Date, string | null][]): FriendLane => ({
        friendName, color, periods: periods.map(([start, end, title]) => ({ start, end, title, location: null }))
    });

    it('layoutDay_shouldGiveEachFriendAnEqualLaneInMentionOrder', () => {
        const { blocks } = layoutDay(wednesday, [
            lane('lea', '#a', [at(14, 18), at(14, 20), 'Poterie']),
            lane('hugo', '#b', [at(14, 18), at(14, 19), null])
        ], [], HOUR);

        expect(blocks.map(b => [b.friendName, b.left, b.width, b.color])).toEqual([
            ['lea', 0, 50, '#a'],
            ['hugo', 50, 50, '#b']
        ]);
    });

    it('layoutDay_shouldPlaceAPeriodByItsHours', () => {
        const { blocks } = layoutDay(wednesday, [lane('lea', '#a', [at(14, 18), at(14, 20), 'Poterie'])], [], HOUR);

        expect(blocks[0]).toMatchObject({ top: 18 * HOUR, height: 2 * HOUR, title: 'Poterie' });
    });

    it('layoutDay_shouldCutAPeriodAcrossMidnightToTheDay', () => {
        const night = lane('sarah', '#a', [at(14, 20), at(15, 2), null]);

        expect(layoutDay(wednesday, [night], [], HOUR).blocks[0]).toMatchObject({ top: 20 * HOUR, height: 4 * HOUR });
        expect(layoutDay(new Date(2026, 9, 15), [night], [], HOUR).blocks[0]).toMatchObject({ top: 0, height: 2 * HOUR });
    });

    it('layoutDay_shouldLeaveOutPeriodsOfOtherDays', () => {
        const { blocks } = layoutDay(wednesday, [lane('lea', '#a', [at(15, 18), at(15, 20), 'x'])], [], HOUR);

        expect(blocks).toEqual([]);
    });

    it('layoutDay_shouldKeepAShortPeriodVisible', () => {
        const { blocks } = layoutDay(wednesday, [lane('lea', '#a', [at(14, 18), new Date(2026, 9, 14, 18, 1), null])], [], HOUR);

        expect(blocks[0].height).toBe(4);
    });

    it('layoutDay_shouldPlaceTheCommonFreeTimeAcrossTheColumn', () => {
        const { free } = layoutDay(wednesday, [], [
            { start: at(13, 22), end: at(14, 9) },
            { start: at(14, 20), end: at(14, 23) },
            { start: at(16, 9), end: at(16, 10) }
        ], HOUR);

        expect(free).toEqual([{ top: 0, height: 9 * HOUR }, { top: 20 * HOUR, height: 3 * HOUR }]);
    });
});
