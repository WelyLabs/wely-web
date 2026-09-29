/**
 * Values injected into index.html at container start by entrypoint.sh, so one image
 * can be deployed to several environments without a rebuild.
 *
 * <p>Declared here rather than reached through `(window as any)`, which hid the fact
 * that the value can be an unsubstituted `$KEYCLOAK_URL` placeholder.
 */
interface Window {
  KEYCLOAK_URL?: string;
}
