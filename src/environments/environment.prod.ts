import { Environment } from './environment.model';

export const environment: Environment = {
  production: true,
  // Same-origin: nginx proxies /api/v1 and /rsocket to the gateway.
  apiUrl: '/api/v1',
  rsocketUrl: '/rsocket',
  // Substituted into index.html at container start by entrypoint.sh, which wins over these.
  authDomain: 'dev-8k6vch1dvh1qxrdz.eu.auth0.com',
  authClientId: 'SET_ME_wely-web-dev',
  authAudience: 'wely-api-dev',
};
