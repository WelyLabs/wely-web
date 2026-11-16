import { Environment } from './environment.model';

export const environment: Environment = {
  production: true,
  // Same-origin: nginx proxies /api/v1 and /rsocket to the gateway.
  apiUrl: '/api/v1',
  rsocketUrl: '/rsocket',
  // Substituted into index.html at container start by entrypoint.sh, which wins over these.
  authDomain: 'auth.welylabs.app',
  authClientId: 'a3HWp7xp83GIpuOyxjAoGfKHvFW44PK7',
  authAudience: 'wely-api-dev',
};
