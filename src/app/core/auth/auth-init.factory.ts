import { inject } from '@angular/core';
import { AuthConfig, AuthService as Auth0Service } from '@auth0/auth0-angular';
import { filter, firstValueFrom, map, race } from 'rxjs';
import { AUTH_CONFIG } from './auth.config';
import { UserService } from '../../services/user.service';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';
import { LoggerService } from '../logging/logger.service';

const SCOPE = 'AuthInit';
const DEFAULT_LOCALE = 'fr';

/** The browser language first, French when the login page does not offer it. */
export function loginLocales(language = navigator.language): string {
    const code = (language || DEFAULT_LOCALE).split('-')[0].toLowerCase();
    return code === DEFAULT_LOCALE ? code : `${code} ${DEFAULT_LOCALE}`;
}

/** Whether a request goes to our gateway, the only place the access token may be sent. */
export function isOwnApiRequest(url: string): boolean {
    return url.startsWith(environment.apiUrl);
}

/** The Auth0 SDK settings: audience, scopes, token storage and which requests get the token. */
export function auth0Config(): AuthConfig {
    return {
        domain: AUTH_CONFIG.domain,
        clientId: AUTH_CONFIG.clientId,
        authorizationParams: {
            // Auth0 only accepts registered callbacks, the bare origins; the route comes back in appState.
            redirect_uri: window.location.origin,
            // Without the audience Auth0 issues an opaque token the services cannot validate.
            audience: AUTH_CONFIG.audience,
            scope: 'openid profile email offline_access',
            ui_locales: loginLocales(),
        },
        // Rotating refresh tokens in local storage: with no custom auth domain, silent iframe auth is blocked as third-party, at the cost of a token any script on this origin can read.
        useRefreshTokens: true,
        cacheLocation: 'localstorage',
        httpInterceptor: {
            // Only our API gets the token, never a third party such as the geocoder; signed-out calls go without it.
            allowedList: [{ uriMatcher: isOwnApiRequest, allowAnonymous: true }],
        },
    };
}

/** Waits for the SDK to restore the session or finish the login redirect, then preloads the profile. */
export async function initializeAuth(): Promise<void> {
    const auth0 = inject(Auth0Service);
    const authService = inject(AuthService);
    const userService = inject(UserService);
    const logger = inject(LoggerService);

    // A rejected initializer stops Angular from starting at all, leaving a blank page.
    // The failure is recorded instead, and the root component shows an error screen.
    const failure = await firstValueFrom(race(
        auth0.error$,
        auth0.isLoading$.pipe(filter(loading => !loading), map(() => null))
    ));
    if (failure) {
        logger.error(SCOPE, 'Auth0 initialisation failed', failure);
        authService.markStartupFailed();
        return;
    }

    if (!(await authService.isLoggedIn())) {
        return;
    }
    logger.debug(SCOPE, 'user authenticated, preloading profile');
    try {
        // Also seeds getToken(), which RSocket reads synchronously.
        await authService.accessToken();
        await firstValueFrom(userService.loadAndSetCurrentUser());
        logger.debug(SCOPE, 'profile preloaded');
    } catch (error) {
        logger.error(SCOPE, 'failed to preload profile', error);
    }
}
