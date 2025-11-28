import { KeycloakService } from 'keycloak-angular';
import { KEYCLOAK_CONFIG } from './keycloak.config';

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

export function initializeKeycloak(keycloak: KeycloakService) {
    return () =>
        keycloak.init({
            config: {
                url: KEYCLOAK_CONFIG.url,
                realm: KEYCLOAK_CONFIG.realm,
                clientId: KEYCLOAK_CONFIG.clientId

            },
            initOptions: {
                onLoad: 'check-sso',
                silentCheckSsoRedirectUri:
                    window.location.origin + '/assets/silent-check-sso.html',
                checkLoginIframe: false,
                locale: getBrowserLocale()
            },
            enableBearerInterceptor: true,
            bearerPrefix: 'Bearer',
            bearerExcludedUrls: ['/assets', '/clients/public']
        });
}
