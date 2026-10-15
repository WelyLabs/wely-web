import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, signal, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoggerService } from './core/logging/logger.service';
import { RouterOutlet } from '@angular/router';
import { KeycloakService, KeycloakEventTypeLegacy } from 'keycloak-angular';
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
  private readonly keycloakService = inject(KeycloakService);
  private readonly userService = inject(UserService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  // Injected here so the theme is applied, and follows the device, from the first screen on.
  private readonly theme = inject(ThemeService);

  /** Keycloak could not be initialised: there is no session to follow or profile to load. */
  protected readonly startupFailed = this.authService.startupFailed;

  protected readonly title = signal('calendar-app');

  ngOnInit(): void {
    if (this.startupFailed()) {
      return;
    }

    // takeUntilDestroyed rather than a Subscription bag: the root component outlives the
    // session, so this is about saying what the lifetime is, not about reclaiming memory.
    this.keycloakService.keycloakEvents$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event) => {
          // keycloakEvents$ emits KeycloakEventTypeLegacy, not KeycloakEventType. The
          // comparisons here used to cast event.type to any and compare against the new
          // enum, whose members have different names — so neither branch ever ran, and
          // this fallback was dead. Proactive refresh in AuthService covered for it.
          // Once the account is deleted the page is being replaced: a login would win that navigation.
          if (event.type === KeycloakEventTypeLegacy.OnTokenExpired) {
            this.keycloakService.updateToken(20).catch(() => {
              if (!this.authService.sessionEnded()) {
                this.keycloakService.login();
              }
            });
          }

          if (event.type === KeycloakEventTypeLegacy.OnAuthRefreshError && !this.authService.sessionEnded()) {
            this.keycloakService.login();
          }
        }
      });

    // Load user profile if logged in
    try {
      if (this.keycloakService.isLoggedIn()) {
        this.userService.loadAndSetCurrentUser()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (user) => this.logger.debug('App', 'User profile loaded:', user),
            error: (err) => this.logger.error('App', 'Error fetching user profile:', err)
          });
        // The theme kept with the account wins over the one last used on this browser.
        this.theme.sync();
      }
    } catch (err) {
      this.logger.error('App', 'Error checking login status:', err);
    }
  }
}
