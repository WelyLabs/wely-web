import { describe, it, expect } from 'vitest';
import { freeWithinUsefulHours, pickOutingSlots, readOutingProposal, roundUpToHalfHour } from './outing-proposal';

// Local times, as the page reasons in the viewer's own day.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);
const range = (start: Date, end: Date) => ({ start, end });

describe('outing-proposal', () => {
  const now = at(14, 9);

  describe('roundUpToHalfHour', () => {
    it('roundUpToHalfHour_shouldKeepADateOnTheHalfHour', () => {
      expect(roundUpToHalfHour(at(14, 18, 30))).toEqual(at(14, 18, 30));
    });

    it('roundUpToHalfHour_shouldMoveToTheNextHalfHour', () => {
      expect(roundUpToHalfHour(at(14, 18, 1))).toEqual(at(14, 18, 30));
      expect(roundUpToHalfHour(at(14, 18, 45))).toEqual(at(14, 19));
      expect(roundUpToHalfHour(new Date(2026, 9, 14, 18, 0, 5))).toEqual(at(14, 18, 30));
    });
  });

  describe('freeWithinUsefulHours', () => {
    it('freeWithinUsefulHours_shouldCutARangeToEachDaysUsefulHours', () => {
      expect(freeWithinUsefulHours([range(at(15, 20), at(17, 10))], now)).toEqual([
        range(at(15, 20), at(15, 23)),
        range(at(16, 8), at(16, 23)),
        range(at(17, 8), at(17, 10))
      ]);
    });

    it('freeWithinUsefulHours_shouldStartFromNow', () => {
      expect(freeWithinUsefulHours([range(at(14, 6), at(14, 12))], now)).toEqual([range(at(14, 9), at(14, 12))]);
    });

    it('freeWithinUsefulHours_shouldDropTheNight', () => {
      expect(freeWithinUsefulHours([range(at(15, 0), at(15, 7))], now)).toEqual([]);
    });

    it('freeWithinUsefulHours_shouldSortThePieces', () => {
      const pieces = freeWithinUsefulHours([range(at(16, 18), at(16, 22)), range(at(15, 18), at(15, 22))], now);
      expect(pieces.map(piece => piece.start)).toEqual([at(15, 18), at(16, 18)]);
    });
  });

  describe('pickOutingSlots', () => {
    it('pickOutingSlots_shouldTakeTwoHoursFromTheStartOfAnEveningRange', () => {
      expect(pickOutingSlots([range(at(15, 18, 10), at(15, 23))], now)).toEqual([range(at(15, 18, 30), at(15, 20, 30))]);
    });

    it('pickOutingSlots_shouldStartAt18_whenTheWholeDayIsFree', () => {
      expect(pickOutingSlots([range(at(15, 8), at(15, 23))], now)).toEqual([range(at(15, 18), at(15, 20))]);
    });

    it('pickOutingSlots_shouldKeepAtMostThreeSlots_onePerDay', () => {
      const ranges = [15, 16, 17, 18].map(day => range(at(day, 18), at(day, 23)));
      ranges.push(range(at(15, 21), at(15, 23)));

      expect(pickOutingSlots(ranges, now)).toEqual([
        range(at(15, 18), at(15, 20)),
        range(at(16, 18), at(16, 20)),
        range(at(17, 18), at(17, 20))
      ]);
    });

    it('pickOutingSlots_shouldAcceptAStartAt21_andAnEndAt23', () => {
      expect(pickOutingSlots([range(at(15, 20, 40), at(15, 23, 30))], now)).toEqual([range(at(15, 21), at(15, 23))]);
    });

    it('pickOutingSlots_shouldSkipARangeStartingAfter21', () => {
      expect(pickOutingSlots([range(at(15, 21, 10), at(15, 23)), range(at(16, 19), at(16, 22))], now))
        .toEqual([range(at(16, 19), at(16, 21))]);
    });

    it('pickOutingSlots_shouldSkipAnEveningShorterThanTwoHours', () => {
      expect(pickOutingSlots([range(at(15, 18), at(15, 19, 30)), range(at(16, 18), at(16, 20))], now))
        .toEqual([range(at(16, 18), at(16, 20))]);
    });

    it('pickOutingSlots_shouldFallBackToTheFirstFreeStretch_withoutAnyEvening', () => {
      expect(pickOutingSlots([range(at(15, 10, 5), at(15, 11)), range(at(16, 9), at(16, 17))], now))
        .toEqual([range(at(15, 10, 30), at(15, 11))]);
    });

    it('pickOutingSlots_shouldCapTheFallbackAtTwoHours', () => {
      expect(pickOutingSlots([range(at(15, 9), at(15, 17))], now)).toEqual([range(at(15, 9), at(15, 11))]);
    });

    it('pickOutingSlots_shouldAnswerNothing_withoutFreeTime', () => {
      expect(pickOutingSlots([], now)).toEqual([]);
      expect(pickOutingSlots([range(at(15, 1), at(15, 6))], now)).toEqual([]);
    });

    it('pickOutingSlots_shouldIgnoreTimeAlreadyPast', () => {
      const evening = at(14, 19);
      expect(pickOutingSlots([range(at(14, 18), at(14, 23))], evening)).toEqual([range(at(14, 19), at(14, 21))]);
    });
  });

  describe('readOutingProposal', () => {
    it('readOutingProposal_shouldReadTheSlotsAndTheFriend', () => {
      const slot = range(at(15, 18), at(15, 20));
      expect(readOutingProposal({ navigationId: 2, proposeSlots: [slot], proposeWith: 'lea' }))
        .toEqual({ proposeSlots: [slot], proposeWith: 'lea' });
    });

    it('readOutingProposal_shouldReadDatesSentAsStrings', () => {
      const proposal = readOutingProposal({
        proposeSlots: [{ start: '2026-10-15T16:00:00Z', end: '2026-10-15T18:00:00Z' }], proposeWith: 'lea'
      });
      expect(proposal?.proposeSlots[0].start.toISOString()).toBe('2026-10-15T16:00:00.000Z');
    });

    it('readOutingProposal_shouldDropUnreadableSlots', () => {
      const proposal = readOutingProposal({
        proposeSlots: [null, { start: 'nope', end: 'nope' }, { start: at(15, 20), end: at(15, 18) }], proposeWith: 'lea'
      });
      expect(proposal).toEqual({ proposeSlots: [], proposeWith: 'lea' });
    });

    it('readOutingProposal_shouldBeNull_withoutAProposal', () => {
      expect(readOutingProposal(null)).toBeNull();
      expect(readOutingProposal('state')).toBeNull();
      expect(readOutingProposal({ navigationId: 1 })).toBeNull();
      expect(readOutingProposal({ proposeSlots: [], proposeWith: 3 })).toBeNull();
    });
  });
});
