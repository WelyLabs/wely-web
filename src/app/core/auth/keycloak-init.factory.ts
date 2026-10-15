import { HttpRequest } from '@angular/common/http';
import { KeycloakService } from 'keycloak-angular';
import { KEYCLOAK_CONFIG } from './keycloak.config';
import { UserService } from '../../services/user.service';
import { AuthService } from './auth.service';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Environment } from '../../../environments/environment.model';
import { LoggerService } from '../logging/logger.service';
import { ACCOUNT_DELETED, ACCOUNT_QUERY_PARAM } from '../../models/account.model';

const SCOPE = 'KeycloakInit';

/** Locales the Keycloak theme provides; anything else falls back to French. */
const SUPPORTED_LOCALES = ['fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'ja', 'zh', 'ru'] as const;
const DEFAULT_LOCALE = 'fr';

type PageLocation = Pick<Location, 'pathname' | 'search'>;

/** Maps the browser language onto a locale the login theme can render. */
function getBrowserLocale(): string {
    const language = navigator.language ?? DEFAULT_LOCALE;
    const code = language.split('-')[0].toLowerCase();

    return (SUPPORTED_LOCALES as readonly string[]).includes(code) ? code : DEFAULT_LOCALE;
}

/** Whether a request goes to our gateway, the only place the access token may be sent. */
export function isOwnApiRequest(request: HttpRequest<unknown>): boolean {
    return request.url.startsWith(environment.apiUrl);
}

/** The landing page shown right after the account was deleted. */
export function isAccountDeletedLanding(location: PageLocation): boolean {
    return location.pathname === '/'
        && new URLSearchParams(location.search).get(ACCOUNT_QUERY_PARAM) === ACCOUNT_DELETED;
}

/** Whether to run the silent SSO check on this page. */
export function shouldCheckSsoSilently(env: Pick<Environment, 'keycloakSilentCheckSso'>, location: PageLocation): boolean {
    // Right after a deletion the SSO session lives until wely-users logs it out, and its code exchange would fail.
    return env.keycloakSilentCheckSso && !isAccountDeletedLanding(location);
}

export function initializeKeycloak(
    keycloak: KeycloakService,
    userService: UserService,
    authService: AuthService,
    logger: LoggerService
) {
    return async () => {
        // A rejected initializer stops Angular from starting at all, leaving a blank page.
        // The failure is recorded instead, and the root component shows an error screen.
        const checkSso = shouldCheckSsoSilently(environment, window.location);
        let authenticated: boolean;
        try {
            authenticated = await keycloak.init({
                config: {
                    url: KEYCLOAK_CONFIG.url,
                    realm: KEYCLOAK_CONFIG.realm,
                    clientId: KEYCLOAK_CONFIG.clientId
                },
                initOptions: {
                    onLoad: checkSso ? 'check-sso' : undefined,
                    silentCheckSsoRedirectUri: checkSso
                        ? window.location.origin + '/assets/silent-check-sso.html'
                        : undefined,
                    checkLoginIframe: false,
                    locale: getBrowserLocale()
                },
                enableBearerInterceptor: true,
                bearerPrefix: 'Bearer',
                bearerExcludedUrls: ['/assets', '/clients/public'],
                // Only our API gets the token: never a third party such as the geocoder.
                shouldAddToken: isOwnApiRequest
            });
        } catch (error) {
            logger.error(SCOPE, 'Keycloak initialisation failed', error);
            authService.markStartupFailed();
            return;
        }

        // If user is authenticated, preload user data and start refresh timer
        if (authenticated) {
            logger.debug(SCOPE, 'user authenticated, preloading profile');
            authService.scheduleTokenRefresh();
            try {
                await firstValueFrom(userService.loadAndSetCurrentUser());
                logger.debug(SCOPE, 'profile preloaded');
            } catch (error) {
                logger.error(SCOPE, 'failed to preload profile', error);
            }
        }
    };
}
