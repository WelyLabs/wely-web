import { ChangeDetectionStrategy, Component, InjectionToken, inject } from '@angular/core';

/**
 * Reloads the app without the OAuth response Keycloak left in the URL: replaying the same
 * authorisation code would fail again.
 */
export const RELOAD_WITHOUT_AUTH_RESPONSE = new InjectionToken<() => void>('RELOAD_WITHOUT_AUTH_RESPONSE', {
  providedIn: 'root',
  factory: () => () => window.location.replace(window.location.origin + window.location.pathname)
});

/** Shown instead of the app when Keycloak could not be initialised. */
@Component({
  selector: 'app-startup-error',
  templateUrl: './startup-error.html',
  styleUrl: './startup-error.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StartupErrorComponent {
  private readonly reload = inject(RELOAD_WITHOUT_AUTH_RESPONSE);

  retry(): void {
    this.reload();
  }
}
