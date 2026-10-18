import { describe, expect, it } from 'vitest';
import {
    ReunionCandidate, byAffinity, friendsGoingLabel, isFriendshipAnniversary, longDateLabel, memoriesHeading, parseInstant,
    reunionLine, upgradeLine, yearsLabel
} from './friendship-insights.model';

describe('friendship-insights.model', () => {
    const candidate = (overrides: Partial<ReunionCandidate> = {}): ReunionCandidate => ({
        friendId: 'hugo', name: 'Hugo', closeness: 'CLOSE', lastSharedAt: '2026-06-01T19:00:00Z', lastSharedEventId: 'e1',
        lastSharedTitle: 'Ciné au Rex', monthsApart: 4, ...overrides
    });

    it('yearsLabel_shouldAgreeWithTheCount', () => {
        expect(yearsLabel(1)).toBe('1 an');
        expect(yearsLabel(3)).toBe('3 ans');
    });

    it('reunionLine_shouldSayHowManyMonths_andTheLastOuting', () => {
        expect(reunionLine(candidate())).toBe('Pas vus depuis 4 mois · Ciné au Rex');
        expect(reunionLine(candidate({ lastSharedTitle: null }))).toBe('Pas vus depuis 4 mois');
    });

    it('reunionLine_shouldSayAWhile_whenUnderTwoMonthsOrUnknown', () => {
        expect(reunionLine(candidate({ monthsApart: 1, lastSharedTitle: null }))).toBe('Pas vus depuis un moment');
        expect(reunionLine(candidate({ monthsApart: null, lastSharedTitle: null }))).toBe('Pas vus depuis un moment');
    });

    it('reunionLine_shouldSayNothingShared_whenTheyNeverWentOut', () => {
        expect(reunionLine(candidate({ lastSharedAt: null, monthsApart: null }))).toContain('Aucune sortie ensemble');
    });

    it('parseInstant_shouldReadAnIsoInstant_andRefuseTheRest', () => {
        expect(parseInstant('2025-03-03T10:00:00.123456789Z')?.getTime()).toBe(Date.UTC(2025, 2, 3, 10, 0, 0, 123));
        expect(parseInstant('nope')).toBeNull();
        expect(parseInstant(null)).toBeNull();
    });

    it('longDateLabel_shouldWriteTheFirstOfTheMonthAsFrenchDoes', () => {
        expect(longDateLabel(new Date(2025, 2, 3))).toBe('le 3 mars 2025');
        expect(longDateLabel(new Date(2024, 4, 1))).toBe('le 1er mai 2024');
    });

    it('memoriesHeading_shouldCountYears_orDaysUnderAYear', () => {
        expect(memoriesHeading({ years: 1, days: 412, name: 'Léa' })).toBe('1 an d’amitié avec Léa');
        expect(memoriesHeading({ years: 2, days: 800, name: 'Léa' })).toBe('2 ans d’amitié avec Léa');
        expect(memoriesHeading({ years: 0, days: 40, name: 'Léa' })).toBe('40 jours d’amitié avec Léa');
        expect(memoriesHeading({ years: 0, days: 0, name: 'Léa' })).toBe('1 jour d’amitié avec Léa');
    });

    it('isFriendshipAnniversary_shouldBeTrue_onTheDayAYearOrMoreLater', () => {
        const since = new Date(2025, 2, 3, 12).toISOString();
        expect(isFriendshipAnniversary(since, 1, new Date(2026, 2, 3, 9))).toBe(true);
        expect(isFriendshipAnniversary(since, 1, new Date(2026, 2, 4, 9))).toBe(false);
    });

    it('isFriendshipAnniversary_shouldBeFalse_underAYearOrWithoutADate', () => {
        expect(isFriendshipAnniversary(new Date(2026, 2, 3, 12).toISOString(), 0, new Date(2026, 2, 3))).toBe(false);
        expect(isFriendshipAnniversary(null, 2, new Date())).toBe(false);
    });

    it('isFriendshipAnniversary_shouldFallOnFeb28_inAYearWithoutFeb29', () => {
        expect(isFriendshipAnniversary(new Date(2024, 1, 29, 12).toISOString(), 1, new Date(2025, 1, 28))).toBe(true);
    });

    it('friendsGoingLabel_shouldCountCloseAndIntimateFriends', () => {
        const going = [
            { userId: 'a', closeness: 'INTIMATE' as const },
            { userId: 'b', closeness: 'CLOSE' as const },
            { userId: 'c', closeness: 'FRIEND' as const }
        ];
        expect(friendsGoingLabel(going, 7)).toBe('2 de tes proches y vont');
        expect(friendsGoingLabel(going.slice(0, 1), 1)).toBe('1 de tes proches y va');
    });

    it('friendsGoingLabel_shouldCountAllFriends_whenNoneIsClose', () => {
        expect(friendsGoingLabel([{ userId: 'c', closeness: 'FRIEND' }], 4)).toBe('4 amis y vont');
        expect(friendsGoingLabel([], 1)).toBe('1 ami y va');
    });

    it('friendsGoingLabel_shouldBeNull_whenNoFriendGoes', () => {
        expect(friendsGoingLabel([], 0)).toBeNull();
        expect(friendsGoingLabel(undefined, undefined)).toBeNull();
    });

    it('byAffinity_shouldPutTheClosestFirst_thenTheSoonest', () => {
        const at = (day: number) => new Date(2026, 9, day);
        const events = [
            { id: 'late-friend', affinity: 1, startDate: at(20) },
            { id: 'none', startDate: at(1) },
            { id: 'intimate', affinity: 3, startDate: at(25) },
            { id: 'early-friend', affinity: 1, startDate: at(10) }
        ];

        expect([...events].sort(byAffinity).map(event => event.id)).toEqual(['intimate', 'early-friend', 'late-friend', 'none']);
    });

    it('upgradeLine_shouldNameTheLevelAndTheMonth', () => {
        expect(upgradeLine('Léa', { closeness: 'INTIMATE', at: new Date(2026, 2, 14).toISOString() }))
            .toBe('Avec Léa, vous êtes devenus intimes en mars');
        expect(upgradeLine('Hugo', { closeness: 'CLOSE', at: 'nope' })).toBe('Avec Hugo, vous êtes devenus proches');
    });
});
