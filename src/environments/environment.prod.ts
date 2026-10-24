import { Environment } from './environment.model';

export const environment: Environment = {
  production: true,
  // Same-origin: nginx proxies /api/v1 and /rsocket to the gateway.
  apiUrl: '/api/v1',
  rsocketUrl: '/rsocket',
  // Substituted into index.html at container start by entrypoint.sh.
  keycloakUrl: 'https://auth.welylabs.app',
  keycloakRealm: 'wely-prod',
  keycloakClientId: 'wely-web-prod-client',
  // Off: the silent check runs in an iframe pointed at Keycloak, which refuses to be framed by
  // another origin (the realm sets X-Frame-Options SAMEORIGIN and frame-ancestors 'self'). The
  // iframe is blocked, keycloak-js times out waiting for it, and init() throws — which showed the
  // startup error screen on every load. Signing in through the button is unaffected; only the
  // automatic session restore is given up. Turning it back on means allowing the app's origin in
  // the realm's frame-ancestors, i.e. weakening clickjacking protection on the identity provider.
  keycloakSilentCheckSso: false,
};
