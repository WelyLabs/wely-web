import { KeycloakService } from 'keycloak-angular';
import { KEYCLOAK_CONFIG } from './keycloak.config';
import { UserService } from '../../services/user.service';
import { AuthService } from './auth.service';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Détecte la langue du navigateur et retourne le code de langue approprié pour Keycloak
 * @returns Code de langue (ex: 'fr', 'en', 'es', etc.)
 */
function getBrowserLocale(): string {
    // Récupère la langue du navigateur
    const browserLang = navigator.language || (navigator as any).userLanguage;

    // Extrait le code de langue (ex: 'fr-FR' -> 'fr', 'en-US' -> 'en')
    const langCode = browserLang.split('-')[0].toLowerCase();

    // Liste des langues supportées par Keycloak (à adapter selon votre configuration)
    const supportedLanguages = ['fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'ja', 'zh', 'ru'];

    // Retourne la langue si elle est supportée, sinon 'fr' par défaut
    return supportedLanguages.includes(langCode) ? langCode : 'fr';
}

export function initializeKeycloak(keycloak: KeycloakService, userService: UserService, authService: AuthService) {
    return async () => {
        // Initialize Keycloak
        const authenticated = await keycloak.init({
            config: {
                url: KEYCLOAK_CONFIG.url,
                realm: KEYCLOAK_CONFIG.realm,
                clientId: KEYCLOAK_CONFIG.clientId
            },
            initOptions: {
                onLoad: (environment as any).keycloakSilentCheckSso !== false ? 'check-sso' : undefined,
                silentCheckSsoRedirectUri: (environment as any).keycloakSilentCheckSso !== false
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
            console.log('✅ User authenticated, preloading user data...');
            authService.scheduleTokenRefresh();
            try {
                await firstValueFrom(userService.loadAndSetCurrentUser());
                console.log('✅ User data preloaded successfully');
            } catch (error) {
                console.error('❌ Failed to preload user data:', error);
            }
        }
    };
}
