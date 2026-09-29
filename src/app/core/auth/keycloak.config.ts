import { environment } from '../../../environments/environment';

/** True when envsubst left the placeholder in place, i.e. nothing was injected. */
function isSubstituted(value: string | undefined): value is string {
  return !!value && !value.startsWith('$');
}

/**
 * Keycloak connection settings.
 *
 * <p>The URL comes from the runtime-injected value when present, so the same built
 * image serves dev and prod, and falls back to the build-time environment otherwise.
 */
export const KEYCLOAK_CONFIG = {
  url: isSubstituted(window.KEYCLOAK_URL) ? window.KEYCLOAK_URL : environment.keycloakUrl,
  realm: 'calendar-app',
  clientId: 'calendar-app-client',
} as const;
