import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../logging/logger.service';
import { removeWelyKeys, storageOrNull } from '../storage/web-storage';
import { ACCOUNT_DELETED_LANDING } from '../../models/account.model';

/** Replaces the whole page, dropping every connection and cache; a token so tests can watch it. */
export const REPLACE_PAGE = new InjectionToken<(url: string) => void>('REPLACE_PAGE', {
    providedIn: 'root',
    factory: () => (url: string) => window.location.replace(url)
});

/** The access-token claim carrying the last credential sign-in, in epoch seconds (auth_time is not in Auth0 access tokens). */
const AUTHENTICATED_AT_CLAIM = 'authenticatedAt';

/** The JSON payload of a JWT, or null when the token is not one. */
function jwtPayload(token: string): Record<string, unknown> | null {
    try {
        const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(base64)) as Record<string, unknown>;
    } catch {
        return null;
    }
}

/**
 * The app's view of the session, over the Auth0 SDK.
 *
 * <p>The SDK refreshes the access token itself, with a rotating refresh token, whenever one is
 * asked for: no refresh timer is kept here.
 */
@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private readonly logger = inject(LoggerService);
    private readonly auth0 = inject(Auth0Service);
    private readonly replacePage = inject(REPLACE_PAGE);

    private readonly startupFailedState = signal(false);
    private readonly signInRefusedState = signal<string | null>(null);
    private readonly sessionEndedState = signal(false);

    /** The last access token the SDK handed out, for callers that cannot wait for one. */
    private token = '';

    /** True when Auth0 could not be initialised: the app shows an error screen instead of a blank page. */
    readonly startupFailed = this.startupFailedState.asReadonly();

    /** True once the account is deleted and the page is being replaced: nothing may start a login any more. */
    readonly sessionEnded = this.sessionEndedState.asReadonly();

    /** Why Auth0 refused the sign-in, in the post-login Action's own words; null when it did not. */
    readonly signInRefused = this.signInRefusedState.asReadonly();

    markStartupFailed(): void {
        this.startupFailedState.set(true);
    }

    /** A refusal is not a breakdown: the service answered, and said no for a reason worth showing. */
    markSignInRefused(reason: string): void {
        this.signInRefusedState.set(reason);
    }

    /** Whether the user is signed in, once the SDK has restored the session. */
    isLoggedIn(): Promise<boolean> {
        return firstValueFrom(this.auth0.isAuthenticated$);
    }

    /** Redirects to the Auth0 login, then back to the given route of the app (the current one by default). */
    login(target = window.location.pathname + window.location.search): Promise<void> {
        return firstValueFrom(this.auth0.loginWithRedirect({ appState: { target } }));
    }

    /** Redirects to the Auth0 sign-up screen, then back to the given route. */
    signup(target: string): Promise<void> {
        return firstValueFrom(this.auth0.loginWithRedirect({
            appState: { target },
            authorizationParams: { screen_hint: 'signup' }
        }));
    }

    /** Forces a full sign-in, even with a live Auth0 session, then comes back to the route. */
    reauthenticate(target: string, loginHint?: string): Promise<void> {
        return firstValueFrom(this.auth0.loginWithRedirect({
            appState: { target },
            authorizationParams: { prompt: 'login', login_hint: loginHint }
        }));
    }

    /** When the user last signed in with their credentials, in milliseconds; null when the token does not say. */
    authenticatedAt(): number | null {
        // shortcut: on Auth0's clock, not the device's (the former client library corrected the skew); a device more than AUTH_SKEW_MS fast asks to re-verify again, measure the skew if that shows up.
        const seconds = jwtPayload(this.token)?.[AUTHENTICATED_AT_CLAIM];
        return typeof seconds === 'number' ? seconds * 1000 : null;
    }

    /** Signs out at Auth0 and comes back to the landing page. */
    logout(): Promise<void> {
        return firstValueFrom(this.auth0.logout({ logoutParams: { returnTo: window.location.origin } }));
    }

    /** A valid access token, refreshed by the SDK when needed; `fresh` skips its cache. */
    async accessToken(fresh = false): Promise<string> {
        this.token = (await firstValueFrom(this.auth0.getAccessTokenSilently(fresh ? { cacheMode: 'off' } : {}))) ?? '';
        return this.token;
    }

    /**
     * The last access token, or an empty string, for synchronous callers (RSocket metadata).
     * Each call also asks the SDK for a fresh one, so the next call never lags far behind.
     */
    getToken(): string {
        this.accessToken().catch((error: unknown) => this.logger.warn('AuthService', 'Could not refresh the access token', error));
        return this.token;
    }

    /** Ends this device's session after the account was deleted, once, and replaces the page with the landing. */
    leaveAfterAccountDeletion(): void {
        if (this.sessionEndedState()) {
            return;
        }
        this.sessionEndedState.set(true);
        this.token = '';
        removeWelyKeys(storageOrNull('local'));
        removeWelyKeys(storageOrNull('session'));
        // Local only: there is no account left to sign out of, but its cached tokens must not outlive the page.
        this.auth0.logout({ openUrl: false }).subscribe({
            error: (error: unknown) => {
                this.logger.warn('AuthService', 'Could not clear the tokens before leaving', error);
                this.replacePage(ACCOUNT_DELETED_LANDING);
            },
            complete: () => this.replacePage(ACCOUNT_DELETED_LANDING)
        });
    }
}
