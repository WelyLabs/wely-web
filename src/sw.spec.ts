import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * public/sw.js is plain JS served as is, outside the Angular build: this runs the real file in
 * a fake ServiceWorkerGlobalScope rather than testing a copy of its logic.
 */
const SOURCE = readFileSync('public/sw.js', 'utf8');
const ORIGIN = 'https://wely.test';

interface FakeClient {
    visibilityState: 'visible' | 'hidden';
    focused: boolean;
    focus: ReturnType<typeof vi.fn>;
    postMessage: ReturnType<typeof vi.fn>;
}

type Listener = (event: unknown) => void;

function fakeClient(visibilityState: 'visible' | 'hidden', focused = false): FakeClient {
    return { visibilityState, focused, focus: vi.fn().mockResolvedValue(undefined), postMessage: vi.fn() };
}

describe('sw.js', () => {
    let listeners: Record<string, Listener>;
    let clients: FakeClient[];
    let scope: {
        addEventListener: (type: string, listener: Listener) => void;
        skipWaiting: ReturnType<typeof vi.fn>;
        location: { origin: string };
        registration: { showNotification: ReturnType<typeof vi.fn> };
        clients: { matchAll: ReturnType<typeof vi.fn>; openWindow: ReturnType<typeof vi.fn>; claim: ReturnType<typeof vi.fn> };
    };

    beforeEach(() => {
        listeners = {};
        clients = [];
        scope = {
            addEventListener: (type, listener) => (listeners[type] = listener),
            skipWaiting: vi.fn(),
            location: { origin: ORIGIN },
            registration: { showNotification: vi.fn().mockResolvedValue(undefined) },
            clients: {
                matchAll: vi.fn(() => Promise.resolve(clients)),
                openWindow: vi.fn().mockResolvedValue(null),
                claim: vi.fn().mockResolvedValue(undefined)
            }
        };
        new Function('self', SOURCE)(scope);
    });

    /** Dispatches an extendable event and waits for what it asked to wait for. */
    async function dispatch(type: string, event: object): Promise<void> {
        let pending: Promise<unknown> = Promise.resolve();
        listeners[type]({ ...event, waitUntil: (promise: Promise<unknown>) => (pending = promise) });
        await pending;
    }

    const push = (payload: unknown) => dispatch('push', { data: { json: () => payload } });

    it('install_shouldTakeOverAtOnce', async () => {
        listeners['install']({});
        await dispatch('activate', {});

        expect(scope.skipWaiting).toHaveBeenCalled();
        expect(scope.clients.claim).toHaveBeenCalled();
    });

    it('push_shouldShowTheNotification_whenNoWelyTabIsVisible', async () => {
        clients = [fakeClient('hidden')];

        await push({ title: 'Alice', body: 'Salut', tag: 'conv-1', link: '/chat/conv-1', type: 'MESSAGE' });

        expect(scope.clients.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true });
        expect(scope.registration.showNotification).toHaveBeenCalledWith('Alice', {
            body: 'Salut',
            tag: 'conv-1',
            renotify: true,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            data: { link: '/chat/conv-1' },
            requireInteraction: false
        });
    });

    it('push_shouldKeepAnIncomingCallOnScreen', async () => {
        await push({ title: 'Alice t\'appelle', body: '', tag: 'call-1', link: '/call/1', type: 'CALL_INCOMING', requireInteraction: true });

        expect(scope.registration.showNotification.mock.calls[0][1]).toMatchObject({ requireInteraction: true });
    });

    it('push_shouldShowNothing_whenAWelyTabIsVisible', async () => {
        clients = [fakeClient('hidden'), fakeClient('visible')];

        await push({ title: 'Alice', body: 'Salut', link: '/chat/conv-1' });

        expect(scope.registration.showNotification).not.toHaveBeenCalled();
    });

    it('push_shouldStillShowSomething_whenThePayloadIsUnreadable', async () => {
        await dispatch('push', { data: { json: () => { throw new SyntaxError('bad'); } } });

        expect(scope.registration.showNotification).toHaveBeenCalledWith('Wely', expect.objectContaining({
            body: '', renotify: false, data: { link: '/' }
        }));
    });

    it('push_shouldStillShowSomething_whenThereIsNoPayload', async () => {
        await dispatch('push', { data: null });

        expect(scope.registration.showNotification).toHaveBeenCalledWith('Wely', expect.anything());
    });

    describe('notificationclick', () => {
        const click = (link: unknown) => {
            const close = vi.fn();
            return { close, done: dispatch('notificationclick', { notification: { close, data: { link } } }) };
        };

        it('notificationclick_shouldFocusTheFocusedTab_andAskTheAppToNavigate', async () => {
            const other = fakeClient('hidden');
            const focused = fakeClient('visible', true);
            clients = [other, focused];

            const { close, done } = click('/chat/conv-1');
            await done;

            expect(close).toHaveBeenCalled();
            expect(focused.focus).toHaveBeenCalled();
            expect(focused.postMessage).toHaveBeenCalledWith({ type: 'navigate', link: '/chat/conv-1' });
            expect(other.postMessage).not.toHaveBeenCalled();
            expect(scope.clients.openWindow).not.toHaveBeenCalled();
        });

        it('notificationclick_shouldUseAnyWelyTab_whenNoneIsFocused', async () => {
            const tab = fakeClient('hidden');
            clients = [tab];

            await click('/friends').done;

            expect(tab.postMessage).toHaveBeenCalledWith({ type: 'navigate', link: '/friends' });
        });

        it('notificationclick_shouldOpenAWindow_whenWelyIsClosed', async () => {
            await click('/event/e1?tab=poll').done;

            expect(scope.clients.openWindow).toHaveBeenCalledWith('/event/e1?tab=poll');
        });

        it('notificationclick_shouldNeverLeaveTheApp', async () => {
            await click('https://evil.example/phish').done;

            expect(scope.clients.openWindow).toHaveBeenCalledWith('/');
        });

        it('notificationclick_shouldOpenTheHomePage_withoutALink', async () => {
            await dispatch('notificationclick', { notification: { close: vi.fn(), data: null } });

            expect(scope.clients.openWindow).toHaveBeenCalledWith('/');
        });
    });
});
