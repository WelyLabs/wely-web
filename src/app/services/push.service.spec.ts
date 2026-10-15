import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../environments/environment';
import { LoggerService } from '../core/logging/logger.service';
import {
    PushService, deviceLabel, isIos, isPushSupported, isStandalone, urlBase64ToUint8Array
} from './push.service';

const API = `${environment.apiUrl}/notifications-service/push`;
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const WINDOWS_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0';
const LINUX_FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';

describe('push helpers', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('urlBase64ToUint8Array_shouldDecodeUrlSafeBase64_withoutPadding', () => {
        expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3]);
        expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([0xfb, 0xff]);
        expect(Array.from(urlBase64ToUint8Array('AQ'))).toEqual([1]);
    });

    it.each([
        [IPHONE, 'Safari · iOS'],
        [ANDROID_CHROME, 'Chrome · Android'],
        [MAC_SAFARI, 'Safari · macOS'],
        [WINDOWS_EDGE, 'Edge · Windows'],
        [LINUX_FIREFOX, 'Firefox · Linux'],
        ['curl/8', 'Navigateur · Appareil']
    ])('deviceLabel_shouldNameTheBrowserAndSystem %#', (userAgent, label) => {
        expect(deviceLabel(userAgent)).toBe(label);
    });

    it('isIos_shouldSpotAnIphone_andAnIpadPosingAsAMac', () => {
        expect(isIos({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 })).toBe(true);
        expect(isIos({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
        expect(isIos({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
        expect(isIos({ userAgent: ANDROID_CHROME, platform: 'Linux', maxTouchPoints: 5 })).toBe(false);
    });

    it('isStandalone_shouldFollowTheDisplayMode', () => {
        vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
        expect(isStandalone()).toBe(true);

        vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
        expect(isStandalone()).toBe(false);
    });

    it('isPushSupported_shouldBeFalse_withoutTheApis', () => {
        expect(isPushSupported()).toBe(false);
    });
});

describe('PushService', () => {
    let http: HttpTestingController;
    let router: { navigateByUrl: ReturnType<typeof vi.fn> };
    let logger: { error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
    let container: {
        register: ReturnType<typeof vi.fn>;
        getRegistration: ReturnType<typeof vi.fn>;
        ready: Promise<unknown>;
        addEventListener: ReturnType<typeof vi.fn>;
        startMessages: ReturnType<typeof vi.fn>;
    };
    let pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
    let notification: { permission: NotificationPermission; requestPermission: ReturnType<typeof vi.fn> };
    let subscription: { endpoint: string; unsubscribe: ReturnType<typeof vi.fn>; toJSON: () => PushSubscriptionJSON };

    function create(): PushService {
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                { provide: Router, useValue: router },
                { provide: LoggerService, useValue: logger }
            ]
        });
        http = TestBed.inject(HttpTestingController);
        return TestBed.inject(PushService);
    }

    /** The request, once the awaited steps before it have run. */
    const request = (url: string, method = 'GET') =>
        vi.waitFor(() => http.expectOne(req => req.url === url && req.method === method));

    beforeEach(() => {
        router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
        logger = { error: vi.fn(), warn: vi.fn() };
        subscription = {
            endpoint: 'https://push.example/abc',
            unsubscribe: vi.fn().mockResolvedValue(true),
            toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'P', auth: 'A' } })
        };
        pushManager = { getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn().mockResolvedValue(subscription) };
        const registration = { pushManager };
        container = {
            register: vi.fn().mockResolvedValue(registration),
            getRegistration: vi.fn().mockResolvedValue(registration),
            ready: Promise.resolve(registration),
            addEventListener: vi.fn(),
            startMessages: vi.fn()
        };
        notification = { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') };
        Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container });
        vi.stubGlobal('PushManager', class { });
        vi.stubGlobal('Notification', notification);
    });

    afterEach(() => {
        http?.verify();
        delete (navigator as { serviceWorker?: unknown }).serviceWorker;
        vi.unstubAllGlobals();
    });

    it('state_shouldBeUnsupported_withoutServiceWorkers', async () => {
        delete (navigator as { serviceWorker?: unknown }).serviceWorker;
        const service = create();

        service.init();
        await service.refresh();

        expect(service.state()).toBe('unsupported');
        expect(await service.enable()).toBe(false);
        expect(await service.disable()).toBe(false);
    });

    it('init_shouldRegisterTheWorkerOnce', () => {
        const service = create();

        service.init();
        service.init();

        expect(container.register).toHaveBeenCalledTimes(1);
        expect(container.register).toHaveBeenCalledWith('/sw.js');
        expect(container.startMessages).toHaveBeenCalled();
    });

    it('init_shouldLogAFailedRegistration', async () => {
        container.register.mockRejectedValue(new Error('blocked'));
        const service = create();

        service.init();
        await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());
    });

    it('init_shouldNavigate_whenTheWorkerSaysSo_andIgnoreAnythingElse', () => {
        const service = create();
        service.init();
        const onMessage = container.addEventListener.mock.calls[0][1] as (event: { data: unknown }) => void;

        onMessage({ data: { type: 'navigate', link: '/chat/c1' } });
        onMessage({ data: { type: 'navigate', link: 'https://evil.example' } });
        onMessage({ data: { type: 'other', link: '/x' } });
        onMessage({ data: null });

        expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
        expect(router.navigateByUrl).toHaveBeenCalledWith('/chat/c1');
    });

    it('refresh_shouldReadTheKeyAndTheSubscription', async () => {
        notification.permission = 'granted';
        pushManager.getSubscription.mockResolvedValue(subscription);
        const service = create();

        const done = service.refresh();
        (await request(`${API}/public-key`)).flush({ publicKey: 'AQID' });
        await done;

        expect(service.state()).toBe('enabled');
    });

    it('refresh_shouldSayUnavailable_whenTheServerHasNoKey', async () => {
        const service = create();

        const done = service.refresh();
        (await request(`${API}/public-key`)).flush({ publicKey: '' });
        await done;

        expect(service.state()).toBe('unavailable');
    });

    it('refresh_shouldLogAFailure', async () => {
        const service = create();

        const done = service.refresh();
        (await request(`${API}/public-key`)).flush('x', { status: 502, statusText: 'Bad Gateway' });
        await done;

        expect(logger.error).toHaveBeenCalled();
        expect(service.state()).toBe('disabled');
    });

    it('state_shouldBeDenied_whenTheUserBlockedNotifications', () => {
        notification.permission = 'denied';

        expect(create().state()).toBe('denied');
    });

    it('enable_shouldSubscribeWithTheServerKey_andHandTheSubscriptionOver', async () => {
        const service = create();

        const done = service.enable();
        expect(service.busy()).toBe(true);
        (await request(`${API}/public-key`)).flush({ publicKey: 'AQID' });
        const put = await request(`${API}/subscriptions`, 'PUT');
        expect(put.request.body).toEqual({
            endpoint: 'https://push.example/abc',
            keys: { p256dh: 'P', auth: 'A' },
            label: deviceLabel(navigator.userAgent)
        });
        put.flush(null);

        expect(await done).toBe(true);
        const options = pushManager.subscribe.mock.calls[0][0] as PushSubscriptionOptionsInit;
        expect(options.userVisibleOnly).toBe(true);
        expect(Array.from(options.applicationServerKey as Uint8Array)).toEqual([1, 2, 3]);
        expect(service.state()).toBe('enabled');
        expect(service.busy()).toBe(false);
    });

    it('enable_shouldReplaceAnOldSubscription_andRegisterTheWorkerIfMissing', async () => {
        pushManager.getSubscription.mockResolvedValue(subscription);
        container.getRegistration.mockResolvedValue(undefined);
        const service = create();

        const done = service.enable();
        (await request(`${API}/public-key`)).flush({ publicKey: 'AQID' });
        (await request(`${API}/subscriptions`, 'PUT')).flush(null);
        await done;

        expect(container.register).toHaveBeenCalledWith('/sw.js');
        expect(subscription.unsubscribe).toHaveBeenCalled();
    });

    it('enable_shouldStop_whenThePermissionIsRefused', async () => {
        notification.requestPermission.mockResolvedValue('denied');
        const service = create();

        expect(await service.enable()).toBe(false);

        expect(service.state()).toBe('denied');
        expect(pushManager.subscribe).not.toHaveBeenCalled();
    });

    it('enable_shouldStop_whenTheServerHasNoKey', async () => {
        const service = create();

        const done = service.enable();
        (await request(`${API}/public-key`)).flush({ publicKey: '' });

        expect(await done).toBe(false);
        expect(service.state()).toBe('unavailable');
        expect(pushManager.subscribe).not.toHaveBeenCalled();
    });

    it('enable_shouldLogAndReturnFalse_whenSubscribingFails', async () => {
        pushManager.subscribe.mockRejectedValue(new DOMException('no', 'AbortError'));
        const service = create();

        const done = service.enable();
        (await request(`${API}/public-key`)).flush({ publicKey: 'AQID' });

        expect(await done).toBe(false);
        expect(logger.error).toHaveBeenCalled();
        expect(service.state()).toBe('disabled');
    });

    it('enable_shouldIgnoreASecondClick_whileWorking', async () => {
        const service = create();

        const first = service.enable();
        expect(await service.enable()).toBe(false);
        (await request(`${API}/public-key`)).flush({ publicKey: 'AQID' });
        (await request(`${API}/subscriptions`, 'PUT')).flush(null);
        await first;

        expect(notification.requestPermission).toHaveBeenCalledTimes(1);
    });

    it('disable_shouldUnsubscribe_andForgetTheEndpointOnTheServer', async () => {
        pushManager.getSubscription.mockResolvedValue(subscription);
        const service = create();

        const done = service.disable();
        const del = await request(`${API}/subscriptions`, 'DELETE');
        expect(del.request.params.get('endpoint')).toBe('https://push.example/abc');
        del.flush(null);

        expect(await done).toBe(true);
        expect(subscription.unsubscribe).toHaveBeenCalled();
        expect(service.state()).toBe('disabled');
    });

    it('disable_shouldSucceed_withNothingToUnsubscribe', async () => {
        const service = create();

        expect(await service.disable()).toBe(true);
    });

    it('disable_shouldLogAndReturnFalse_whenTheServerRefuses', async () => {
        pushManager.getSubscription.mockResolvedValue(subscription);
        const service = create();

        const done = service.disable();
        (await request(`${API}/subscriptions`, 'DELETE')).flush('x', { status: 500, statusText: 'Error' });

        expect(await done).toBe(false);
        expect(logger.error).toHaveBeenCalled();
    });

    it('clearShownNotifications_shouldCloseEveryNotificationShownByTheWorker', async () => {
        const shown = [{ close: vi.fn() }, { close: vi.fn() }];
        container.getRegistration.mockResolvedValue({ pushManager, getNotifications: vi.fn().mockResolvedValue(shown) });
        const service = create();

        await service.clearShownNotifications();

        expect(container.getRegistration).toHaveBeenCalledWith('/');
        shown.forEach(notification => expect(notification.close).toHaveBeenCalled());
    });

    it('clearShownNotifications_shouldDoNothing_withoutPushSupport', async () => {
        delete (navigator as { serviceWorker?: unknown }).serviceWorker;
        const service = create();

        await expect(service.clearShownNotifications()).resolves.toBeUndefined();
        expect(container.getRegistration).not.toHaveBeenCalled();
    });

    it('clearShownNotifications_shouldLogAndResolve_whenTheWorkerCannotBeRead', async () => {
        container.getRegistration.mockRejectedValue(new Error('no worker'));
        const service = create();

        await expect(service.clearShownNotifications()).resolves.toBeUndefined();
        expect(logger.warn).toHaveBeenCalled();
    });
});
