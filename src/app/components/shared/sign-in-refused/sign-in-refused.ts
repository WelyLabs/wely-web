import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RELOAD_WITHOUT_AUTH_RESPONSE } from '../startup-error/startup-error';

/**
 * Shown instead of the app when Auth0 refused the sign-in: an unverified address, most often.
 *
 * Distinct from the startup error on purpose. Nothing broke, so the screen does not apologise for
 * a breakdown — it repeats what the post-login Action said and lets the user come back once they
 * have acted on it.
 */
@Component({
  selector: 'app-sign-in-refused',
  templateUrl: './sign-in-refused.html',
  // The same canvas as the startup error, down to the class names: one screen, two reasons.
  styleUrl: '../startup-error/startup-error.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SignInRefusedComponent {
  /** Auth0's own sentence, written by the Action that refused. */
  readonly reason = input.required<string>();

  private readonly reload = inject(RELOAD_WITHOUT_AUTH_RESPONSE);

  /**
   * Comes back to a clean page rather than signing in again: an immediate retry would be refused
   * for the same reason, and the user has something to do in their mailbox first.
   */
  retry(): void {
    this.reload();
  }
}
