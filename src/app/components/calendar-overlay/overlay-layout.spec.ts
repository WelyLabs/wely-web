import { describe, it, expect } from 'vitest';
import { FriendLane, laneWidth, layoutDay, summarizeDay, usefulHours } from './overlay-layout';

describe('layoutDay', () => {
    const HOUR = 80;
    const wednesday = new Date(2026, 9, 14);
    const at = (day: number, hour: number) => new Date(2026, 9, day, hour);

    const lane = (friendName: string, color: string, ...periods: [Date, Date, string | null][]): FriendLane => ({
        friendName, color, periods: periods.map(([start, end, title]) => ({ start, end, title, location: null }))
    });

    it('layoutDay_shouldGiveEachFriendAnEqualLaneInMentionOrder_afterTheUsersOwn', () => {
        const { blocks } = layoutDay(wednesday, [
            lane('lea', '#a', [at(14, 18), at(14, 20), 'Poterie']),
            lane('hugo', '#b', [at(14, 18), at(14, 19), null])
        ], [], HOUR);

        const third = 100 / 3;
        expect(blocks.map(b => [b.friendName, b.left, b.width, b.color])).toEqual([
            ['lea', third, third, '#a'],
            ['hugo', 2 * third, third, '#b']
        ]);
    });

    it('layoutDay_shouldColourEachPeriodByItsOwner_inASharedLane', () => {
        const circle: FriendLane = {
            friendName: 'Mon cercle', color: '#lane', periods: [
                { start: at(14, 18), end: at(14, 20), title: 'Poterie', location: null, owner: 'lea', color: '#lea' },
                { start: at(14, 9), end: at(14, 10), title: null, location: null }
            ]
        };

        const { blocks } = layoutDay(wednesday, [circle], [], HOUR);

        expect(blocks.map(b => [b.owner, b.color])).toEqual([['lea', '#lea'], [null, '#lane']]);
    });

    it('laneWidth_shouldShareTheColumnBetweenTheUserAndTheirFriends', () => {
        expect(laneWidth(0)).toBe(100);
        expect(laneWidth(1)).toBe(50);
        expect(laneWidth(4)).toBe(20);
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

    it('layoutDay_shouldPlaceTheCommonFreeTimeWithinUsefulHoursOnly', () => {
        const { free } = layoutDay(wednesday, [], [
            { start: at(13, 22), end: at(14, 9) },
            { start: at(14, 20), end: at(15, 1) },
            { start: at(14, 2), end: at(14, 6) },
            { start: at(16, 9), end: at(16, 10) }
        ], HOUR);

        expect(free).toEqual([{ top: 8 * HOUR, height: HOUR }, { top: 20 * HOUR, height: 3 * HOUR }]);
    });

    it('usefulHours_shouldRunFromEightToEleven', () => {
        expect(usefulHours(wednesday)).toEqual({ start: at(14, 8), end: at(14, 23) });
    });

    it('summarizeDay_shouldGiveEachFriendTheShareOfUsefulHoursTheyAreBusy', () => {
        const { loads } = summarizeDay(wednesday, [
            lane('lea', '#a', [at(14, 9), at(14, 12), 'x'], [at(14, 11), at(14, 14), null]),
            lane('hugo', '#b', [at(14, 0), at(14, 7), null]),
            lane('sarah', '#c', [at(14, 20), at(15, 2), null])
        ], []);

        expect(loads.map(load => [load.friendName, load.color, load.ratio])).toEqual([
            ['lea', '#a', 5 / 15],
            ['hugo', '#b', 0],
            ['sarah', '#c', 3 / 15]
        ]);
    });

    it('summarizeDay_shouldKeepTheLongestCommonFreeStretch_ofTwoHoursOrMore', () => {
        const { commonFree } = summarizeDay(wednesday, [], [
            { start: at(14, 8), end: at(14, 9) },
            { start: at(14, 19), end: at(15, 3) }
        ]);

        expect(commonFree).toEqual({ start: at(14, 19), end: at(14, 23) });
    });

    it('summarizeDay_shouldNotMarkADay_whenTheCommonFreeTimeIsShorterThanTwoHours', () => {
        const { commonFree } = summarizeDay(wednesday, [], [
            // 21:30 to 6:00 is long, but only 1h30 of it falls before 23:00.
            { start: new Date(2026, 9, 14, 21, 30), end: at(15, 6) },
            { start: at(14, 10), end: new Date(2026, 9, 14, 11, 45) }
        ]);

        expect(commonFree).toBeNull();
    });

    it('summarizeDay_shouldNotMarkADayFreeFromMorningToNight', () => {
        // Nobody has plans: the whole 8:00–23:00 is free, which says nothing worth a pill.
        const { commonFree } = summarizeDay(wednesday, [], [{ start: at(13, 22), end: at(15, 2) }]);

        expect(commonFree).toBeNull();
    });
});

