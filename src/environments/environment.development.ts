import { Environment } from './environment.model';

export const environment: Environment = {
  production: false,
  apiUrl: 'http://localhost:8081/api/v1',
  rsocketUrl: 'ws://localhost:8081/rsocket',
  authDomain: 'auth.welylabs.app',
  // Placeholder until the wely-web-dev application exists in the tenant; entrypoint.sh overrides it in the cluster.
  authClientId: 'a3HWp7xp83GIpuOyxjAoGfKHvFW44PK7',
  authAudience: 'wely-api-dev',
};
