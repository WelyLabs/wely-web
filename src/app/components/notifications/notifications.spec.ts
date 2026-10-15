import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenterService } from '../../services/notification-center.service';
import { aNotification, notificationCenterStub } from '../../../testing/notification-center.stub';
import { NotificationsPageComponent } from './notifications';

describe('NotificationsPageComponent', () => {
    let fixture: ComponentFixture<NotificationsPageComponent>;
    let component: NotificationsPageComponent;
    let center: ReturnType<typeof notificationCenterStub>;
    let router: { navigateByUrl: ReturnType<typeof vi.fn> };

    const el = (): HTMLElement => fixture.nativeElement;
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 9, 15, 18, 0));
        center = notificationCenterStub();
        router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
        TestBed.configureTestingModule({
            imports: [NotificationsPageComponent],
            providers: [
                { provide: NotificationCenterService, useValue: center },
                { provide: Router, useValue: router }
            ]
        });
        fixture = TestBed.createComponent(NotificationsPageComponent);
        component = fixture.componentInstance;
    });

    afterEach(() => vi.useRealTimers());

    it('ngOnInit_shouldReloadTheFirstPage', () => {
        fixture.detectChanges();

        expect(center.refresh).toHaveBeenCalled();
    });

    it('template_shouldSayWhenThereIsNothing', () => {
        fixture.detectChanges();

        expect(el().querySelector('.empty')?.textContent).toContain('Aucune notification pour l\'instant');
        expect(el().querySelector('.mark-all')).toBeNull();
        expect(el().querySelector('.more')).toBeNull();
    });

    it('days_shouldGroupByDay_withTodayAndYesterday', () => {
        center.notifications.set([
            aNotification({ id: 'a', createdAt: hoursAgo(1) }),
            aNotification({ id: 'b', createdAt: hoursAgo(2) }),
            aNotification({ id: 'c', createdAt: hoursAgo(24) })
        ]);
        fixture.detectChanges();

        const headings = Array.from(el().querySelectorAll('.day h2')).map(h => h.textContent?.trim());
        expect(headings).toEqual(['Aujourd\'hui', 'Hier']);
        expect(component.days()[0].items.map(item => item.id)).toEqual(['a', 'b']);
    });

    it('template_shouldStyleUnreadItems_andShowTheCategoryIconAndTime', () => {
        center.notifications.set([
            aNotification({ id: 'a', type: 'CALL_MISSED', category: 'CALLS', createdAt: hoursAgo(0.5) }),
            aNotification({ id: 'b', readAt: hoursAgo(0.1), createdAt: hoursAgo(3) })
        ]);
        fixture.detectChanges();

        const items = el().querySelectorAll<HTMLElement>('.item');
        expect(items[0].classList).toContain('unread');
        expect(items[0].querySelector('.icon')?.textContent?.trim()).toBe('call_missed');
        expect(items[0].querySelector('.time')?.textContent).toBe('il y a 30 min');
        expect(items[1].classList).not.toContain('unread');
        expect(items[1].querySelector('.dot')).toBeNull();
    });

    it('open_shouldMarkReadAndNavigate', () => {
        center.notifications.set([aNotification({ id: 'a', link: '/friends/alice' })]);
        fixture.detectChanges();

        el().querySelector<HTMLElement>('.item')!.click();

        expect(center.markRead).toHaveBeenCalledWith(['a']);
        expect(router.navigateByUrl).toHaveBeenCalledWith('/friends/alice');
    });

    it('open_shouldNotMarkAgain_whatIsAlreadyRead', () => {
        component.open(aNotification({ readAt: hoursAgo(1) }));

        expect(center.markRead).not.toHaveBeenCalled();
        expect(router.navigateByUrl).toHaveBeenCalled();
    });

    it('markAllRead_shouldBeOffered_onlyWithUnreadNotifications', () => {
        center.notifications.set([aNotification()]);
        center.unreadCount.set(1);
        fixture.detectChanges();

        el().querySelector<HTMLElement>('.mark-all')!.click();

        expect(center.markAllRead).toHaveBeenCalled();
    });

    it('loadMore_shouldAskTheCenter_andWaitWhileLoading', () => {
        center.notifications.set([aNotification()]);
        center.hasMore.set(true);
        fixture.detectChanges();

        el().querySelector<HTMLElement>('.more')!.click();
        expect(center.loadMore).toHaveBeenCalled();

        center.loading.set(true);
        fixture.detectChanges();
        const more = el().querySelector<HTMLButtonElement>('.more')!;
        expect(more.disabled).toBe(true);
        expect(more.textContent).toContain('Chargement');
    });

    it('timeOf_shouldMoveOnWithTheClock', () => {
        const notification = aNotification({ createdAt: new Date().toISOString() });
        fixture.detectChanges();
        expect(component.timeOf(notification)).toBe('À l\'instant');

        vi.advanceTimersByTime(5 * 60_000);

        expect(component.timeOf(notification)).toBe('il y a 5 min');
    });
});
