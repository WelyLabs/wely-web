import { KeycloakService } from 'keycloak-angular';
import { KEYCLOAK_CONFIG } from './keycloak.config';
import { UserService } from '../../services/user.service';
import { AuthService } from './auth.service';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoggerService } from '../logging/logger.service';

const SCOPE = 'KeycloakInit';

/** Locales the Keycloak theme provides; anything else falls back to French. */
const SUPPORTED_LOCALES = ['fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'ja', 'zh', 'ru'] as const;
const DEFAULT_LOCALE = 'fr';

/** Maps the browser language onto a locale the login theme can render. */
function getBrowserLocale(): string {
    const language = navigator.language ?? DEFAULT_LOCALE;
    const code = language.split('-')[0].toLowerCase();

    return (SUPPORTED_LOCALES as readonly string[]).includes(code) ? code : DEFAULT_LOCALE;
}

export function initializeKeycloak(
    keycloak: KeycloakService,
    userService: UserService,
    authService: AuthService,
    logger: LoggerService
) {
    return async () => {
        // Initialize Keycloak
        const authenticated = await keycloak.init({
            config: {
                url: KEYCLOAK_CONFIG.url,
                realm: KEYCLOAK_CONFIG.realm,
                clientId: KEYCLOAK_CONFIG.clientId
            },
            initOptions: {
                onLoad: environment.keycloakSilentCheckSso ? 'check-sso' : undefined,
                silentCheckSsoRedirectUri: environment.keycloakSilentCheckSso
                    ? window.location.origin + '/assets/silent-check-sso.html'
                    : undefined,
                checkLoginIframe: false,
                locale: getBrowserLocale()
            },
            enableBearerInterceptor: true,
            bearerPrefix: 'Bearer',
            bearerExcludedUrls: ['/assets', '/clients/public']
        });

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
