import { Environment } from './environment.model';

export const environment: Environment = {
  production: true,
  // Same-origin: nginx proxies /api/v1 and /rsocket to the gateway.
  apiUrl: '/api/v1',
  rsocketUrl: '/rsocket',
  // Substituted into index.html at container start by entrypoint.sh.
  keycloakUrl: 'https://auth.welylabs.app',
  keycloakSilentCheckSso: true,
};
