import { TestBed } from '@angular/core/testing';
import { AuthService, REPLACE_PAGE } from './auth.service';
import { KeycloakService } from 'keycloak-angular';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('AuthService', () => {
    let service: AuthService;
    let keycloakMock: Partial<KeycloakService>;
    let replacePage: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        TestBed.resetTestingModule();
        vi.useFakeTimers();
        vi.clearAllMocks();

        keycloakMock = {
            getKeycloakInstance: vi.fn().mockReturnValue({
                tokenParsed: { exp: (new Date().getTime() / 1000) + 1000 },
                token: 'mock-token'
            }),
            updateToken: vi.fn().mockReturnValue(Promise.resolve(true)),
            isLoggedIn: vi.fn().mockReturnValue(true),
            login: vi.fn().mockReturnValue(Promise.resolve()),
            logout: vi.fn().mockReturnValue(Promise.resolve()),
            clearToken: vi.fn()
        } as any; // Cast to any for the factory setup, but variable is Partial<KeycloakService>
        replacePage = vi.fn();

        TestBed.configureTestingModule({
            providers: [
                AuthService,
                { provide: KeycloakService, useValue: keycloakMock },
                { provide: REPLACE_PAGE, useValue: replacePage }
            ]
        });
        service = TestBed.inject(AuthService);
    });

    afterEach(() => {
        if (service) {
            service.stopTokenRefresh();
        }
        vi.restoreAllMocks();
        vi.useRealTimers();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('should get token', () => {
        expect(service.getToken()).toBe('mock-token');
    });

    it('should check if logged in', async () => {
        const loggedIn = await service.isLoggedIn();
        expect(loggedIn).toBe(true);
        expect(keycloakMock.isLoggedIn).toHaveBeenCalled();
    });

    it('should login', async () => {
        await service.login('redirect');
        expect(keycloakMock.login).toHaveBeenCalledWith({ redirectUri: 'redirect' });
    });

    it('should logout', async () => {
        await service.logout();
        expect(keycloakMock.logout).toHaveBeenCalled();
    });

    it('should schedule token refresh based on exp', () => {
        const now = new Date().getTime();
        const exp = (now + 200000) / 1000;

        (keycloakMock.getKeycloakInstance as any).mockReturnValue({
            tokenParsed: { exp: exp }
        });

        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
        service.scheduleTokenRefresh();

        // Le comportement testé est le délai programmé, pas le message journalisé :
        // 200s d'expiration moins la marge de 70s.
        const scheduledDelay = setTimeoutSpy.mock.calls.at(-1)?.[1] as number;
        expect(scheduledDelay).toBeGreaterThan(125_000);
        expect(scheduledDelay).toBeLessThan(135_000);
    });

    it('should fallback to 60s check if no exp found', () => {
        (keycloakMock.getKeycloakInstance as any).mockReturnValue({
            tokenParsed: {}
        });

        const consoleSpy = vi.spyOn(console, 'warn');
        service.scheduleTokenRefresh();

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No token expiration found'));
    });

    it('should execute token update and reschedule', async () => {
        (keycloakMock.getKeycloakInstance as any).mockClear();

        service.scheduleTokenRefresh();
        expect(keycloakMock.getKeycloakInstance).toHaveBeenCalledTimes(1);

        await vi.advanceTimersToNextTimerAsync();

        expect(keycloakMock.updateToken).toHaveBeenCalledWith(70);
        expect(keycloakMock.getKeycloakInstance).toHaveBeenCalledTimes(2);
    });

    it('should retry token update later on failure', async () => {
        // 1. Setup failure mock
        // Rejected when called, like the real updateToken: a promise rejected up front sits
        // unhandled until the timer fires, which native promises report (zone.js's did not).
        (keycloakMock.updateToken as any).mockImplementation(() => Promise.reject('error'));
        (keycloakMock.getKeycloakInstance as any).mockClear();
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        // 2. Start refresh cycle
        service.scheduleTokenRefresh();

        // 3. Move to first update attempt (Timer 1)
        await vi.runOnlyPendingTimersAsync();
        expect(keycloakMock.updateToken).toHaveBeenCalledTimes(1);
        expect(consoleSpy).toHaveBeenCalled();

        // 4. Move to retry attempt (Timer 2, 30s later)
        // We use runOnlyPendingTimersAsync to be exact
        await vi.runOnlyPendingTimersAsync();

        expect(keycloakMock.updateToken).toHaveBeenCalledTimes(2);
    });

    it('should stop token refresh', () => {
        service.scheduleTokenRefresh();
        service.stopTokenRefresh();

        vi.runAllTimers();
        expect(keycloakMock.updateToken).not.toHaveBeenCalled();
    });

    describe('account deletion', () => {
        const instance = (tokenParsed: Record<string, unknown>, timeSkew: number | null = 0) =>
            (keycloakMock.getKeycloakInstance as any).mockReturnValue({ tokenParsed, timeSkew, token: 'mock-token' });

        it('reauthenticate_shouldForceAFullLogin_withPromptLoginAndTheRedirect', async () => {
            await service.reauthenticate('https://app/preferences?account=delete');

            expect(keycloakMock.login).toHaveBeenCalledWith({
                prompt: 'login', redirectUri: 'https://app/preferences?account=delete', loginHint: undefined
            });
        });

        it('reauthenticate_shouldPrefillTheUsername_whenAHintIsGiven', async () => {
            await service.reauthenticate('https://app/preferences?account=delete', 'camille');

            expect(keycloakMock.login).toHaveBeenCalledWith(expect.objectContaining({ loginHint: 'camille' }));
        });

        it('authenticatedAt_shouldReadAuthTimeInMilliseconds', () => {
            instance({ auth_time: 1_760_000_000 });

            expect(service.authenticatedAt()).toBe(1_760_000_000_000);
        });

        it('authenticatedAt_shouldConvertToTheDeviceClock_withTheTimeSkew', () => {
            // keycloak-js measures timeSkew as the device clock minus Keycloak's, in seconds.
            instance({ auth_time: 1_760_000_000 }, 120);

            expect(service.authenticatedAt()).toBe(1_760_000_120_000);
        });

        it('authenticatedAt_shouldBeNull_whenTheTokenHasNoAuthTime', () => {
            instance({ exp: 1 });

            expect(service.authenticatedAt()).toBeNull();
        });

        it('sessionEnded_shouldBeFalse_atStart', () => {
            expect(service.sessionEnded()).toBe(false);
        });

        it('leaveAfterAccountDeletion_shouldStopRefreshClearWelyStorageAndTheToken_thenReplaceThePage', () => {
            localStorage.setItem('wely.theme', 'DARK');
            localStorage.setItem('kc-callback-1', '{}');
            sessionStorage.setItem('wely.accountDeletion.requestedAt', '1');
            service.scheduleTokenRefresh();

            service.leaveAfterAccountDeletion();

            expect(localStorage.getItem('wely.theme')).toBeNull();
            expect(localStorage.getItem('kc-callback-1')).toBe('{}');
            expect(sessionStorage.getItem('wely.accountDeletion.requestedAt')).toBeNull();
            expect(keycloakMock.clearToken).toHaveBeenCalledTimes(1);
            expect(replacePage).toHaveBeenCalledWith('/?account=deleted');
            vi.runAllTimers();
            expect(keycloakMock.updateToken).not.toHaveBeenCalled();
        });

        it('leaveAfterAccountDeletion_shouldMarkTheSessionEnded', () => {
            service.leaveAfterAccountDeletion();

            expect(service.sessionEnded()).toBe(true);
        });

        it('leaveAfterAccountDeletion_shouldDoNothing_whenCalledTwice', () => {
            service.leaveAfterAccountDeletion();
            service.leaveAfterAccountDeletion();

            expect(keycloakMock.clearToken).toHaveBeenCalledTimes(1);
            expect(replacePage).toHaveBeenCalledTimes(1);
        });

        it('leaveAfterAccountDeletion_shouldStillLeave_whenStorageIsBlocked', () => {
            vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
                throw new DOMException('blocked', 'SecurityError');
            });

            service.leaveAfterAccountDeletion();

            expect(replacePage).toHaveBeenCalledWith('/?account=deleted');
            vi.restoreAllMocks();
        });

        it('leaveAfterAccountDeletion_shouldStillLeave_whenTheTokenCannotBeCleared', () => {
            (keycloakMock.clearToken as any).mockImplementation(() => {
                throw new Error('not initialised');
            });
            vi.spyOn(console, 'warn').mockImplementation(() => undefined);

            service.leaveAfterAccountDeletion();

            expect(replacePage).toHaveBeenCalledWith('/?account=deleted');
        });
    });
});
