/**
 * Shape every environment file must satisfy.
 *
 * <p>Each file used to be an independent object literal, so nothing caught a key
 * going missing, and reading one required an `as any` cast that hid the gap. Typing the three files
 * against this interface turns that into a compile error.
 */
export interface Environment {
  readonly production: boolean;
  /** Gateway base URL, absolute in development, same-origin in production. */
  readonly apiUrl: string;
  /** RSocket endpoint, WebSocket scheme in development. */
  readonly rsocketUrl: string;
  /** Auth0 tenant domain; one tenant serves every environment. */
  readonly authDomain: string;
  /** SPA application of this environment, wely-web-<env>. */
  readonly authClientId: string;
  /** API identifier the access token is issued for, wely-api-<env>. */
  readonly authAudience: string;
}
