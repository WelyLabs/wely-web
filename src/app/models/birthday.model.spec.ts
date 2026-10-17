import { describe, expect, it } from 'vitest';
import {
    birthDateBounds, birthDateError, birthdayEmoji, birthdayTone, dayMonthLabel, isBirthdayToday, parseLocalDate,
    surpriseDescription, surpriseTitle, toLocalDateValue
} from './birthday.model';

describe('birthday.model', () => {
    const today = new Date(2026, 9, 18);

    it.each([
        [{ mine: true, closeness: null }, 'mine', '🎂'],
        [{ mine: false, closeness: 'FRIEND' }, 'friend', '🎈'],
        [{ mine: false, closeness: 'CLOSE' }, 'close', '🎁'],
        [{ mine: false, closeness: 'INTIMATE' }, 'intimate', '💝'],
        [{ mine: false, closeness: null }, 'friend', '🎈']
    ] as const)('birthdayTone_shouldFollowTheCloseness %#', (birthday, tone, emoji) => {
        expect(birthdayTone(birthday)).toBe(tone);
        expect(birthdayEmoji(birthdayTone(birthday))).toBe(emoji);
    });

    it('dayMonthLabel_shouldSayTheDayAndMonthOnly', () => {
        expect(dayMonthLabel(3, 12)).toBe('12 mars');
        expect(dayMonthLabel(5, 1)).toBe('1er mai');
        expect(dayMonthLabel(13, 1)).toBe('');
    });

    it('parseLocalDate_shouldReadAValidDate_andRefuseTheRest', () => {
        expect(parseLocalDate('2026-03-12')?.getTime()).toBe(new Date(2026, 2, 12).getTime());
        expect(parseLocalDate('2026-02-30')).toBeNull();
        expect(parseLocalDate('12/03/2026')).toBeNull();
        expect(parseLocalDate(null)).toBeNull();
        expect(toLocalDateValue(new Date(2026, 2, 5))).toBe('2026-03-05');
    });

    it('isBirthdayToday_shouldMatchTheDayAndMonth_whateverTheYear', () => {
        expect(isBirthdayToday('1995-10-18', today)).toBe(true);
        expect(isBirthdayToday('1995-10-19', today)).toBe(false);
        expect(isBirthdayToday(null, today)).toBe(false);
    });

    it('isBirthdayToday_shouldCelebrateFeb29OnFeb28_inANonLeapYear', () => {
        expect(isBirthdayToday('2000-02-29', new Date(2027, 1, 28))).toBe(true);
        expect(isBirthdayToday('2000-02-29', new Date(2028, 1, 28))).toBe(false);
        expect(isBirthdayToday('2000-02-29', new Date(2028, 1, 29))).toBe(true);
    });

    it('birthDateError_shouldAcceptAnAgeBetween13And120', () => {
        expect(birthDateError('1995-03-12', today)).toBeNull();
        expect(birthDateError('2013-10-18', today)).toBeNull();
        expect(birthDateError('2013-10-19', today)).toContain('13 ans');
        expect(birthDateError('1900-01-01', today)).toContain('pas correcte');
        expect(birthDateError('', today)).toContain('Indique');
        expect(birthDateBounds(today)).toEqual({ min: '1906-10-18', max: '2013-10-18' });
    });

    it('surpriseTitle_andDescription_shouldNameTheHonoree', () => {
        expect(surpriseTitle('Léa')).toBe('Anniversaire surprise de Léa 🎉');
        expect(surpriseDescription('Léa')).toContain('Léa ne voit pas cet événement');
    });
});
