import { environment } from '../../../environments/environment';

/** True when envsubst left the placeholder in place, i.e. nothing was injected. */
function isSubstituted(value: string | undefined): value is string {
  return !!value && !value.startsWith('$');
}

/**
 * Auth0 connection settings.
 *
 * <p>All three come from the runtime-injected values when present, so the same built image
 * serves every environment, and fall back to the build-time environment otherwise. One Auth0
 * tenant serves them all, with an application and an API named after each environment, so none
 * of this can be a constant in the bundle.
 */
export const AUTH_CONFIG = {
  domain: isSubstituted(window.AUTH_DOMAIN) ? window.AUTH_DOMAIN : environment.authDomain,
  clientId: isSubstituted(window.AUTH_CLIENT_ID) ? window.AUTH_CLIENT_ID : environment.authClientId,
  audience: isSubstituted(window.AUTH_AUDIENCE) ? window.AUTH_AUDIENCE : environment.authAudience,
} as const;
