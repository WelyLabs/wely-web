import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { KeycloakService } from 'keycloak-angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../environments/environment';
import { LoggerService } from '../core/logging/logger.service';
import { AppNotification } from '../models/notification.model';
import { aNotification } from '../../testing/notification-center.stub';
import { statusResponse, streamResponse } from '../../testing/sse-response';
import { AuthService } from '../core/auth/auth.service';
import { NOTIFICATIONS_PAGE_SIZE, NotificationCenterService } from './notification-center.service';

const API = `${environment.apiUrl}/notifications-service`;

describe('NotificationCenterService', () => {
    let service: NotificationCenterService;
    let http: HttpTestingController;
    let fetchMock: ReturnType<typeof vi.fn>;
    let logger: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
    let auth: { leaveAfterAccountDeletion: ReturnType<typeof vi.fn> };

    const at = (minute: number) => new Date(Date.UTC(2026, 9, 15, 12, minute)).toISOString();
    const page = (count: number, from = 59) =>
        Array.from({ length: count }, (_, i) => aNotification({ id: `p${i}`, createdAt: at(from - i) }));
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));
    const expectPage = (before?: string) => http.expectOne(request =>
        request.url === `${API}/notifications`
        && request.params.get('limit') === String(NOTIFICATIONS_PAGE_SIZE)
        && request.params.get('before') === (before ?? null));
    const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        logger = { warn: vi.fn(), error: vi.fn() };
        auth = { leaveAfterAccountDeletion: vi.fn() };
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                { provide: KeycloakService, useValue: { getToken: () => Promise.resolve('tok') } },
                { provide: LoggerService, useValue: logger },
                { provide: AuthService, useValue: auth }
            ]
        });
        service = TestBed.inject(NotificationCenterService);
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        service.stop();
        vi.unstubAllGlobals();
        http.verify();
    });

    /** Fills the list through refresh() with the given first page. */
    function load(items: AppNotification[]): void {
        service.refresh();
        expectPage().flush(items);
    }

    describe('stream', () => {
        it('start_shouldOpenTheStreamOnce_withTheToken_andLoadTheFirstPage', async () => {
            fetchMock.mockResolvedValue(streamResponse([], true));

            service.start();
            service.start();
            await flush();

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe(`${API}/notifications/stream`);
            expect(init.headers).toEqual({ Authorization: 'Bearer tok', Accept: 'text/event-stream' });
            expectPage().flush(page(2));
            expect(service.notifications().map(n => n.id)).toEqual(['p0', 'p1']);
        });

        it('stream_shouldSetTheUnreadCount_andEmitNewNotificationsFirst', async () => {
            const fresh = aNotification({ id: 'new', createdAt: at(59) });
            fetchMock.mockResolvedValue(streamResponse([sse('unread', { count: 4 }), sse('notification', fresh)], true));
            const seen: AppNotification[] = [];
            service.events$.subscribe(n => seen.push(n));

            service.start();
            await flush();
            expectPage().flush([aNotification({ id: 'old', createdAt: at(1) })]);

            expect(service.unreadCount()).toBe(4);
            expect(seen).toEqual([fresh]);
            expect(service.notifications().map(n => n.id)).toEqual(['new', 'old']);
        });

        it('stream_shouldUpdateAGroupedNotificationInPlace', async () => {
            const first = aNotification({ id: 'g', count: 1, body: 'Salut', createdAt: at(1) });
            const second = { ...first, count: 2, body: '2 nouveaux messages', createdAt: at(5) };
            fetchMock.mockResolvedValue(streamResponse([sse('notification', first), sse('notification', second)], true));

            service.start();
            await flush();
            expectPage().flush([]);

            expect(service.notifications()).toEqual([second]);
        });

        it('stream_shouldNotToastANotificationAlreadyRead', async () => {
            fetchMock.mockResolvedValue(streamResponse([sse('notification', aNotification({ readAt: at(2) }))], true));
            const seen = vi.fn();
            service.events$.subscribe(seen);

            service.start();
            await flush();
            expectPage().flush([]);

            expect(seen).not.toHaveBeenCalled();
        });

        it('stream_shouldLogAndSkip_anUnreadableEvent', async () => {
            fetchMock.mockResolvedValue(streamResponse(['event: notification\ndata: {oops\n\n', sse('unread', { count: 1 })], true));

            service.start();
            await flush();
            expectPage().flush([]);

            expect(logger.error).toHaveBeenCalledWith('NotificationCenterService', 'Unreadable stream event', expect.anything());
            expect(service.unreadCount()).toBe(1);
        });

        it('start_shouldStopRetrying_whenTheStreamAnswers410', async () => {
            vi.useFakeTimers();
            fetchMock.mockResolvedValue(statusResponse(410));

            service.start();
            await vi.advanceTimersByTimeAsync(60_000);

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(logger.warn).not.toHaveBeenCalled();
            vi.useRealTimers();
        });

        it('start_shouldLeaveTheApp_whenTheStreamAnswers410', async () => {
            fetchMock.mockResolvedValue(statusResponse(410));

            service.start();
            await flush();

            expect(auth.leaveAfterAccountDeletion).toHaveBeenCalledTimes(1);
        });

        it('start_shouldKeepRetrying_onAnotherRefusal', async () => {
            vi.useFakeTimers();
            fetchMock.mockResolvedValue(statusResponse(503));

            service.start();
            await vi.advanceTimersByTimeAsync(1_000);

            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(auth.leaveAfterAccountDeletion).not.toHaveBeenCalled();
            service.stop();
            vi.useRealTimers();
        });
    });

    describe('pages', () => {
        it('refresh_shouldTellWhetherMoreExist_fromTheFirstPageSize', () => {
            load(page(NOTIFICATIONS_PAGE_SIZE));

            expect(service.hasMore()).toBe(true);
        });

        it('refresh_shouldMergeWithWhatIsLoaded_withoutDuplicates', () => {
            load(page(3));
            service.refresh();
            expectPage().flush([aNotification({ id: 'p0', title: 'changed', createdAt: at(59) })]);

            expect(service.notifications().map(n => n.id)).toEqual(['p0', 'p1', 'p2']);
            expect(service.notifications()[0].title).toBe('changed');
        });

        it('refresh_shouldLogAFailure', () => {
            service.refresh();
            expectPage().flush('down', { status: 502, statusText: 'Bad Gateway' });

            expect(logger.error).toHaveBeenCalled();
        });

        it('loadMore_shouldAskForWhatIsOlderThanTheLastItem', () => {
            load(page(NOTIFICATIONS_PAGE_SIZE));
            const last = service.notifications().at(-1)!;

            service.loadMore();
            expect(service.loading()).toBe(true);
            service.loadMore();
            expectPage(last.createdAt).flush([aNotification({ id: 'older', createdAt: at(0) })]);

            expect(service.loading()).toBe(false);
            expect(service.hasMore()).toBe(false);
            expect(service.notifications().at(-1)?.id).toBe('older');
        });

        it('loadMore_shouldDoNothing_withoutMore', () => {
            load(page(2));

            service.loadMore();

            http.expectNone(`${API}/notifications`);
        });

        it('loadMore_shouldLetTheUserRetry_afterAFailure', () => {
            load(page(NOTIFICATIONS_PAGE_SIZE));

            service.loadMore();
            http.expectOne(request => request.params.has('before')).flush('x', { status: 500, statusText: 'Error' });

            expect(service.loading()).toBe(false);
            expect(service.hasMore()).toBe(true);
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('read', () => {
        beforeEach(async () => {
            fetchMock.mockResolvedValue(streamResponse([sse('unread', { count: 3 })], true));
            service.start();
            await flush();
            expectPage().flush([
                aNotification({ id: 'a', groupKey: 'conv1', createdAt: at(3) }),
                aNotification({ id: 'b', groupKey: 'conv2', createdAt: at(2) }),
                aNotification({ id: 'c', groupKey: null, readAt: at(1), createdAt: at(1) }),
                aNotification({ id: 'd', groupKey: null, createdAt: at(0) })
            ]);
        });

        const readAt = (id: string) => service.notifications().find(n => n.id === id)?.readAt;

        it('markRead_shouldMarkAtOnce_thenTellTheServer', () => {
            service.markRead(['a', 'c']);

            expect(readAt('a')).not.toBeNull();
            expect(service.unreadCount()).toBe(2);
            const request = http.expectOne(`${API}/notifications/read`);
            expect(request.request.method).toBe('POST');
            expect(request.request.body).toEqual({ ids: ['a', 'c'] });
            request.flush(null, { status: 204, statusText: 'No Content' });
        });

        it('markRead_shouldNotCallTheServer_forWhatIsAlreadyRead', () => {
            service.markRead(['c']);

            http.expectNone(`${API}/notifications/read`);
            expect(service.unreadCount()).toBe(3);
        });

        it('markGroupRead_shouldMarkTheGroup_andAlwaysTellTheServer', () => {
            service.markGroupRead('conv1');

            expect(readAt('a')).not.toBeNull();
            expect(readAt('b')).toBeNull();
            expect(service.unreadCount()).toBe(2);
            expect(http.expectOne(`${API}/notifications/read`).request.body).toEqual({ groupKey: 'conv1' });

            service.markGroupRead('conv-not-loaded');
            expect(http.expectOne(`${API}/notifications/read`).request.body).toEqual({ groupKey: 'conv-not-loaded' });
        });

        it('markAllRead_shouldClearEverything', () => {
            service.markAllRead();

            expect(service.notifications().every(n => n.readAt)).toBe(true);
            expect(service.unreadCount()).toBe(0);
            expect(http.expectOne(`${API}/notifications/read`).request.body).toEqual({ all: true });
        });

        it('markRead_shouldReloadTheCount_whenTheServerRefuses', () => {
            service.markRead(['a']);
            http.expectOne(`${API}/notifications/read`).flush('x', { status: 500, statusText: 'Error' });

            http.expectOne(`${API}/notifications/unread-count`).flush({ count: 3 });

            expect(service.unreadCount()).toBe(3);
            expect(logger.error).toHaveBeenCalled();
        });

        it('markRead_shouldLog_whenTheCountCannotBeReloadedEither', () => {
            service.markAllRead();
            http.expectOne(`${API}/notifications/read`).flush('x', { status: 500, statusText: 'Error' });
            http.expectOne(`${API}/notifications/unread-count`).flush('x', { status: 500, statusText: 'Error' });

            expect(logger.error).toHaveBeenCalledTimes(2);
        });
    });

    describe('preferences', () => {
        it('getPreferences_shouldReadThem', () => {
            const prefs = { calls: true, messages: false, events: true, friends: true, birthdays: true };
            let read: unknown;

            service.getPreferences().subscribe(value => (read = value));
            http.expectOne(`${API}/preferences`).flush(prefs);

            expect(read).toEqual(prefs);
        });

        it('savePreferences_shouldPutThem', () => {
            const prefs = { calls: false, messages: true, events: true, friends: false, birthdays: true };

            service.savePreferences(prefs).subscribe();
            const request = http.expectOne(`${API}/preferences`);

            expect(request.request.method).toBe('PUT');
            expect(request.request.body).toEqual(prefs);
            request.flush(null);
        });
    });

    it('stop_shouldCloseTheStream', async () => {
        fetchMock.mockResolvedValue(streamResponse([], true));
        service.start();
        await flush();
        expectPage().flush([]);
        const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;

        service.stop();

        expect(signal.aborted).toBe(true);
    });
});
