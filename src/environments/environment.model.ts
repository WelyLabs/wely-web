/**
 * Shape every environment file must satisfy.
 *
 * <p>Each file used to be an independent object literal, so nothing caught a key
 * going missing: `environment.prod.ts` had silently lost `keycloakSilentCheckSso`,
 * and reading it required an `as any` cast that hid the gap. Typing the three files
 * against this interface turns that into a compile error.
 */
export interface Environment {
  readonly production: boolean;
  /** Gateway base URL, absolute in development, same-origin in production. */
  readonly apiUrl: string;
  /** RSocket endpoint, WebSocket scheme in development. */
  readonly rsocketUrl: string;
  /** Keycloak base URL; production overrides it at container start. */
  readonly keycloakUrl: string;
  /**
   * Whether to attempt a silent SSO check on load. Disabled locally, where the
   * silent-check iframe cannot reach a same-site Keycloak.
   */
  readonly keycloakSilentCheckSso: boolean;
}
