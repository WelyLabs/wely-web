import { describe, expect, it } from 'vitest';
import { aNotification } from '../../testing/notification-center.stub';
import { badgeText, dayLabel, groupByDay, isSameScreen, notificationIcon, relativeTime } from './notification.model';

describe('notification.model', () => {
    const now = new Date(2026, 9, 15, 18, 0);

    it.each([
        ['CALL_INCOMING', 'call'],
        ['CALL_MISSED', 'call_missed'],
        ['MESSAGE', 'chat'],
        ['EVENT_DATE_FIXED', 'event'],
        ['EVENT_MOVED', 'event'],
        ['FRIEND_REQUEST', 'person_add'],
        ['FRIEND_ACCEPTED', 'how_to_reg'],
        ['BIRTHDAY_TODAY', 'cake'],
        ['FRIEND_BIRTHDAY', 'cake'],
        ['BIRTHDAY_SURPRISE_PROPOSAL', 'celebration'],
        ['BIRTHDAY_SURPRISE_CREATED', 'celebration'],
        ['REUNION_NUDGE', 'waving_hand'],
        ['FRIENDSHIP_ANNIVERSARY', 'auto_awesome'],
        ['CLOSENESS_UPGRADED', 'favorite']
    ] as const)('notificationIcon_shouldMap %s to %s', (type, icon) => {
        expect(notificationIcon(type)).toBe(icon);
    });

    it('notificationIcon_shouldFallBack_forATypeAddedLater', () => {
        expect(notificationIcon('SOMETHING_NEW' as never)).toBe('notifications');
    });

    it('isSameScreen_shouldCompareThePathsOnly', () => {
        expect(isSameScreen('/chat/c1?x=1#y', '/chat/c1')).toBe(true);
        expect(isSameScreen('/chat/c1/', '/chat/c1')).toBe(true);
        expect(isSameScreen('/chat/c10', '/chat/c1')).toBe(false);
        expect(isSameScreen('/', '/')).toBe(true);
    });

    it('isSameScreen_shouldTellALinkWithAQueryApart_fromThePageWithout', () => {
        // A surprise to prepare is another screen than the calendar already open: it gets its toast.
        expect(isSameScreen('/calendar', '/calendar?surpriseFor=lea&date=2027-03-12')).toBe(false);
        expect(isSameScreen('/calendar?date=2027-03-12', '/calendar?date=2027-03-12')).toBe(true);
    });

    it('isSameScreen_shouldTellAnOutingProposal_fromTheFriendPage', () => {
        // « Proposer une sortie » from a reunion nudge opens the form, not just the page already open.
        expect(isSameScreen('/friends/hugo', '/friends/hugo?propose=1')).toBe(false);
        expect(isSameScreen('/friends/lea', '/friends/lea/memories')).toBe(false);
    });

    it('badgeText_shouldBeEmptyAtZero_andCappedAt99', () => {
        expect(badgeText(0)).toBeNull();
        expect(badgeText(-1)).toBeNull();
        expect(badgeText(7)).toBe('7');
        expect(badgeText(99)).toBe('99');
        expect(badgeText(100)).toBe('99+');
    });

    it('dayLabel_shouldNameTodayAndYesterday_thenTheDate', () => {
        expect(dayLabel(new Date(2026, 9, 15, 0, 5), now)).toBe('Aujourd\'hui');
        expect(dayLabel(new Date(2026, 9, 14, 23, 59), now)).toBe('Hier');
        expect(dayLabel(new Date(2026, 9, 12, 9, 0), now)).toBe('Lundi 12 octobre');
        expect(dayLabel(new Date(2025, 11, 31, 9, 0), now)).toBe('Mercredi 31 décembre 2025');
    });

    it('relativeTime_shouldCountMinutesThenHours_thenGiveTheTime', () => {
        expect(relativeTime(new Date(now.getTime() - 20_000), now)).toBe('À l\'instant');
        expect(relativeTime(new Date(now.getTime() - 5 * 60_000), now)).toBe('il y a 5 min');
        expect(relativeTime(new Date(now.getTime() - 3 * 3_600_000), now)).toBe('il y a 3 h');
        expect(relativeTime(new Date(2026, 9, 14, 9, 7), now)).toBe('09:07');
    });

    it('groupByDay_shouldKeepTheOrder_andStartANewGroupEachDay', () => {
        const items = [
            aNotification({ id: 'a', createdAt: new Date(2026, 9, 15, 17).toISOString() }),
            aNotification({ id: 'b', createdAt: new Date(2026, 9, 15, 8).toISOString() }),
            aNotification({ id: 'c', createdAt: new Date(2026, 9, 14, 8).toISOString() }),
            aNotification({ id: 'd', createdAt: new Date(2026, 9, 1, 8).toISOString() })
        ];

        const days = groupByDay(items, now);

        expect(days.map(day => [day.label, day.items.map(item => item.id)])).toEqual([
            ['Aujourd\'hui', ['a', 'b']],
            ['Hier', ['c']],
            ['Jeudi 1 octobre', ['d']]
        ]);
    });
});
