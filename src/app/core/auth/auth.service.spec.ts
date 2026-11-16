import { TestBed } from '@angular/core/testing';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { AuthService, REPLACE_PAGE } from './auth.service';
import { LoggerService } from '../logging/logger.service';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** A JWT with the given payload; the signature is never checked client-side. */
function jwt(payload: Record<string, unknown>): string {
    const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature`;
}

describe('AuthService', () => {
    let service: AuthService;
    let auth0: {
        isAuthenticated$: BehaviorSubject<boolean>;
        loginWithRedirect: ReturnType<typeof vi.fn>;
        logout: ReturnType<typeof vi.fn>;
        getAccessTokenSilently: ReturnType<typeof vi.fn>;
    };
    let logger: { warn: ReturnType<typeof vi.fn> };
    let replacePage: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        TestBed.resetTestingModule();
        auth0 = {
            isAuthenticated$: new BehaviorSubject(true),
            loginWithRedirect: vi.fn().mockReturnValue(of(undefined)),
            logout: vi.fn().mockReturnValue(of(undefined)),
            getAccessTokenSilently: vi.fn().mockReturnValue(of('mock-token'))
        };
        logger = { warn: vi.fn() };
        replacePage = vi.fn();

        TestBed.configureTestingModule({
            providers: [
                AuthService,
                { provide: Auth0Service, useValue: auth0 },
                { provide: LoggerService, useValue: logger },
                { provide: REPLACE_PAGE, useValue: replacePage }
            ]
        });
        service = TestBed.inject(AuthService);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('isLoggedIn_shouldFollowTheSdk', async () => {
        expect(await service.isLoggedIn()).toBe(true);
        auth0.isAuthenticated$.next(false);
        expect(await service.isLoggedIn()).toBe(false);
    });

    it('login_shouldComeBackToTheGivenRoute', async () => {
        await service.login('/calendar');

        expect(auth0.loginWithRedirect).toHaveBeenCalledWith({ appState: { target: '/calendar' } });
    });

    it('login_shouldComeBackToTheCurrentRoute_byDefault', async () => {
        await service.login();

        expect(auth0.loginWithRedirect).toHaveBeenCalledWith({ appState: { target: window.location.pathname + window.location.search } });
    });

    it('signup_shouldOpenTheSignUpScreen', async () => {
        await service.signup('/calendar');

        expect(auth0.loginWithRedirect).toHaveBeenCalledWith({
            appState: { target: '/calendar' }, authorizationParams: { screen_hint: 'signup' }
        });
    });

    it('logout_shouldSignOutAtAuth0_andComeBackToTheOrigin', async () => {
        await service.logout();

        expect(auth0.logout).toHaveBeenCalledWith({ logoutParams: { returnTo: window.location.origin } });
    });

    it('accessToken_shouldAskTheSdk_andRememberTheToken', async () => {
        expect(await service.accessToken()).toBe('mock-token');
        expect(auth0.getAccessTokenSilently).toHaveBeenCalledWith({});
        auth0.getAccessTokenSilently.mockReturnValue(new Subject());

        expect(service.getToken()).toBe('mock-token');
    });

    it('accessToken_shouldSkipTheCache_whenFreshIsAsked', async () => {
        await service.accessToken(true);

        expect(auth0.getAccessTokenSilently).toHaveBeenCalledWith({ cacheMode: 'off' });
    });

    it('getToken_shouldBeEmpty_beforeAnyToken_andLogAFailedRefresh', async () => {
        auth0.getAccessTokenSilently.mockReturnValue(throwError(() => new Error('login_required')));

        expect(service.getToken()).toBe('');
        await vi.waitFor(() => expect(logger.warn).toHaveBeenCalled());
    });

    describe('account deletion', () => {
        const withToken = async (payload: Record<string, unknown>) => {
            auth0.getAccessTokenSilently.mockReturnValue(of(jwt(payload)));
            await service.accessToken();
        };

        it('reauthenticate_shouldForceAFullLogin_withPromptLoginAndTheRoute', async () => {
            await service.reauthenticate('/preferences?account=delete');

            expect(auth0.loginWithRedirect).toHaveBeenCalledWith({
                appState: { target: '/preferences?account=delete' },
                authorizationParams: { prompt: 'login', login_hint: undefined }
            });
        });

        it('reauthenticate_shouldPrefillTheUsername_whenAHintIsGiven', async () => {
            await service.reauthenticate('/preferences?account=delete', 'camille');

            expect(auth0.loginWithRedirect).toHaveBeenCalledWith(expect.objectContaining({
                authorizationParams: { prompt: 'login', login_hint: 'camille' }
            }));
        });

        it('authenticatedAt_shouldReadTheClaimInMilliseconds', async () => {
            await withToken({ authenticatedAt: 1_760_000_000 });

            expect(service.authenticatedAt()).toBe(1_760_000_000_000);
        });

        it('authenticatedAt_shouldBeNull_whenTheTokenHasNoClaim', async () => {
            await withToken({ exp: 1 });

            expect(service.authenticatedAt()).toBeNull();
        });

        it('authenticatedAt_shouldBeNull_withoutAToken', () => {
            expect(service.authenticatedAt()).toBeNull();
        });

        it('sessionEnded_shouldBeFalse_atStart', () => {
            expect(service.sessionEnded()).toBe(false);
        });

        it('leaveAfterAccountDeletion_shouldClearWelyStorageAndTheLocalSession_thenReplaceThePage', async () => {
            await service.accessToken();
            localStorage.setItem('wely.theme', 'DARK');
            localStorage.setItem('other', '{}');
            sessionStorage.setItem('wely.accountDeletion.requestedAt', '1');

            service.leaveAfterAccountDeletion();

            expect(localStorage.getItem('wely.theme')).toBeNull();
            expect(localStorage.getItem('other')).toBe('{}');
            expect(sessionStorage.getItem('wely.accountDeletion.requestedAt')).toBeNull();
            expect(auth0.logout).toHaveBeenCalledWith({ openUrl: false });
            expect(replacePage).toHaveBeenCalledWith('/?account=deleted');
            expect(service.sessionEnded()).toBe(true);
        });

        it('leaveAfterAccountDeletion_shouldWaitForTheTokensToBeCleared', () => {
            const cleared = new Subject<void>();
            auth0.logout.mockReturnValue(cleared);

            service.leaveAfterAccountDeletion();
            expect(replacePage).not.toHaveBeenCalled();
            cleared.complete();

            expect(replacePage).toHaveBeenCalledWith('/?account=deleted');
        });

        it('leaveAfterAccountDeletion_shouldDoNothing_whenCalledTwice', () => {
            service.leaveAfterAccountDeletion();
            service.leaveAfterAccountDeletion();

            expect(auth0.logout).toHaveBeenCalledTimes(1);
            expect(replacePage).toHaveBeenCalledTimes(1);
        });

        it('leaveAfterAccountDeletion_shouldStillLeave_whenStorageIsBlocked', () => {
            vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
                throw new DOMException('blocked', 'SecurityError');
            });

            service.leaveAfterAccountDeletion();

            expect(replacePage).toHaveBeenCalledWith('/?account=deleted');
        });

        it('leaveAfterAccountDeletion_shouldStillLeave_whenTheTokensCannotBeCleared', () => {
            auth0.logout.mockReturnValue(throwError(() => new Error('storage refused')));

            service.leaveAfterAccountDeletion();

            expect(logger.warn).toHaveBeenCalled();
            expect(replacePage).toHaveBeenCalledWith('/?account=deleted');
        });
    });
});
