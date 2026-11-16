import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, signal, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoggerService } from './core/logging/logger.service';
import { RouterOutlet } from '@angular/router';
import { filter, from, switchMap, tap } from 'rxjs';
import { UserService } from './services/user.service';
import { AuthService } from './core/auth/auth.service';
import { StartupErrorComponent } from './components/shared/startup-error/startup-error';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, StartupErrorComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App implements OnInit {
  private readonly logger = inject(LoggerService);
  private readonly userService = inject(UserService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  // Injected here so the theme is applied, and follows the device, from the first screen on.
  private readonly theme = inject(ThemeService);

  /** Auth0 could not be initialised: there is no session to follow or profile to load. */
  protected readonly startupFailed = this.authService.startupFailed;

  protected readonly title = signal('calendar-app');

  ngOnInit(): void {
    if (this.startupFailed()) {
      return;
    }

    // The SDK renews tokens on demand and the session interceptor handles a dead session,
    // so all that is left here is loading the profile of a signed-in user.
    from(this.authService.isLoggedIn())
      .pipe(
        filter(Boolean),
        // The theme kept with the account wins over the one last used on this browser.
        tap(() => this.theme.sync()),
        switchMap(() => this.userService.loadAndSetCurrentUser()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (user) => this.logger.debug('App', 'User profile loaded:', user),
        error: (err) => this.logger.error('App', 'Error fetching user profile:', err)
      });
  }
}
