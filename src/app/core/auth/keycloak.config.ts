import { environment } from '../../../environments/environment';

/**
 * Configuration centralisée pour Keycloak
 * Modifiez ces valeurs pour adapter la configuration à votre environnement
 */
export const KEYCLOAK_CONFIG = {
    /**
     * URL du serveur Keycloak
     */
    url: environment.keycloakUrl,

    /**
     * Nom du realm Keycloak
     */
    realm: 'calendar-app',

    /**
     * ID du client Keycloak
     * Modifiez cette valeur si vous souhaitez utiliser un autre nom de client
     */
    clientId: 'calendar-app-client'
};
