import { TestBed } from '@angular/core/testing';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { BehaviorSubject, ReplaySubject, of, throwError } from 'rxjs';
import { auth0Config, initializeAuth, isOwnApiRequest, loginLocales } from './auth-init.factory';
import { AuthService } from './auth.service';
import { UserService } from '../../services/user.service';
import { LoggerService } from '../logging/logger.service';
import { environment } from '../../../environments/environment';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('initializeAuth', () => {
    let auth0: { isLoading$: BehaviorSubject<boolean>; error$: ReplaySubject<Error> };
    let authService: { isLoggedIn: ReturnType<typeof vi.fn>; accessToken: ReturnType<typeof vi.fn>; markStartupFailed: ReturnType<typeof vi.fn> };
    let userService: { loadAndSetCurrentUser: ReturnType<typeof vi.fn> };

    const run = () => TestBed.runInInjectionContext(() => initializeAuth());

    beforeEach(() => {
        TestBed.resetTestingModule();
        auth0 = { isLoading$: new BehaviorSubject(false), error$: new ReplaySubject(1) };
        authService = {
            isLoggedIn: vi.fn().mockResolvedValue(true),
            accessToken: vi.fn().mockResolvedValue('token'),
            markStartupFailed: vi.fn()
        };
        userService = { loadAndSetCurrentUser: vi.fn().mockReturnValue(of({})) };
        TestBed.configureTestingModule({
            providers: [
                { provide: Auth0Service, useValue: auth0 },
                { provide: AuthService, useValue: authService },
                { provide: UserService, useValue: userService },
                { provide: LoggerService, useValue: { debug: vi.fn(), error: vi.fn() } }
            ]
        });
    });

    it('initializeAuth_shouldSeedTheTokenAndPreloadTheProfile_whenAuthenticated', async () => {
        await run();

        expect(authService.accessToken).toHaveBeenCalled();
        expect(userService.loadAndSetCurrentUser).toHaveBeenCalled();
        expect(authService.markStartupFailed).not.toHaveBeenCalled();
    });

    it('initializeAuth_shouldPreloadNothing_whenNotAuthenticated', async () => {
        authService.isLoggedIn.mockResolvedValue(false);

        await run();

        expect(authService.accessToken).not.toHaveBeenCalled();
        expect(userService.loadAndSetCurrentUser).not.toHaveBeenCalled();
    });

    it('initializeAuth_shouldWaitForTheSdkToFinishLoading', async () => {
        auth0.isLoading$.next(true);
        let done = false;

        const started = run().then(() => (done = true));
        await Promise.resolve();
        expect(done).toBe(false);
        auth0.isLoading$.next(false);
        await started;

        expect(userService.loadAndSetCurrentUser).toHaveBeenCalled();
    });

    it('initializeAuth_shouldSurviveAProfilePreloadFailure', async () => {
        userService.loadAndSetCurrentUser.mockReturnValue(throwError(() => new Error('API Error')));

        await expect(run()).resolves.toBeUndefined();
        expect(authService.markStartupFailed).not.toHaveBeenCalled();
    });

    it('initializeAuth_shouldRecordTheFailureInsteadOfRejecting_whenTheSdkFailed', async () => {
        // A rejected initializer stops Angular from starting: the 2026-10-10 blank page.
        auth0.isLoading$.next(true);
        auth0.error$.next(new Error('invalid state'));

        await expect(run()).resolves.toBeUndefined();
        expect(authService.markStartupFailed).toHaveBeenCalled();
        expect(userService.loadAndSetCurrentUser).not.toHaveBeenCalled();
    });
});

describe('isOwnApiRequest', () => {
    it('isOwnApiRequest_shouldSignCallsToOurApi', () => {
        expect(isOwnApiRequest(`${environment.apiUrl}/events-service/events`)).toBe(true);
    });

    it('isOwnApiRequest_shouldNeverSendTheTokenToAThirdParty', () => {
        expect(isOwnApiRequest('https://photon.komoot.io/api/?q=Lyon')).toBe(false);
    });
});

describe('auth0Config', () => {
    it('auth0Config_shouldAskForTheApiAudienceAndARefreshToken', () => {
        expect(auth0Config()).toMatchObject({
            authorizationParams: {
                audience: environment.authAudience,
                scope: 'openid profile email offline_access',
                redirect_uri: window.location.origin
            },
            useRefreshTokens: true,
            cacheLocation: 'localstorage'
        });
    });

    it('auth0Config_shouldRestrictTheTokenToOurApi', () => {
        expect(auth0Config().httpInterceptor?.allowedList).toEqual([{ uriMatcher: isOwnApiRequest, allowAnonymous: true }]);
    });
});

describe('loginLocales', () => {
    it('loginLocales_shouldPreferTheBrowserLanguage_thenFrench', () => {
        expect(loginLocales('de-DE')).toBe('de fr');
    });

    it('loginLocales_shouldBeFrenchAlone_forAFrenchOrMissingLanguage', () => {
        expect(loginLocales('fr-FR')).toBe('fr');
        expect(loginLocales('')).toBe('fr');
    });
});
