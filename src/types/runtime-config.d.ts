/**
 * Values injected into index.html at container start by entrypoint.sh, so one image
 * can be deployed to several environments without a rebuild.
 *
 * <p>Declared here rather than reached through `(window as any)`, which hid the fact
 * that the value can be an unsubstituted `$AUTH_DOMAIN` placeholder.
 */
interface Window {
  AUTH_DOMAIN?: string;
  AUTH_CLIENT_ID?: string;
  AUTH_AUDIENCE?: string;
}
