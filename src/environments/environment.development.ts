import { Environment } from './environment.model';

export const environment: Environment = {
  production: false,
  apiUrl: 'http://localhost:8081/api/v1',
  rsocketUrl: 'ws://localhost:8081/rsocket',
  keycloakUrl: 'http://localhost:8080',
  keycloakRealm: 'wely-local',
  keycloakClientId: 'wely-web-local-client',
  keycloakSilentCheckSso: false,
};
