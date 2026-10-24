import { environment } from '../../../environments/environment';

/** True when envsubst left the placeholder in place, i.e. nothing was injected. */
function isSubstituted(value: string | undefined): value is string {
  return !!value && !value.startsWith('$');
}

/**
 * Keycloak connection settings.
 *
 * <p>All three come from the runtime-injected values when present, so the same built image
 * serves every environment, and fall back to the build-time environment otherwise. One
 * Keycloak now serves them all with one realm each (wely-dev, wely-prod), and a client named
 * after its service and environment, so none of this can be a constant in the bundle.
 */
export const KEYCLOAK_CONFIG = {
  url: isSubstituted(window.KEYCLOAK_URL) ? window.KEYCLOAK_URL : environment.keycloakUrl,
  realm: isSubstituted(window.KEYCLOAK_REALM) ? window.KEYCLOAK_REALM : environment.keycloakRealm,
  clientId: isSubstituted(window.KEYCLOAK_CLIENT_ID)
    ? window.KEYCLOAK_CLIENT_ID
    : environment.keycloakClientId,
} as const;
