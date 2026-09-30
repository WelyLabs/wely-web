import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, signal, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoggerService } from './core/logging/logger.service';
import { RouterOutlet } from '@angular/router';
import { KeycloakService, KeycloakEventTypeLegacy } from 'keycloak-angular';
import { UserService } from './services/user.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App implements OnInit {
  private readonly logger = inject(LoggerService);
  private readonly keycloakService = inject(KeycloakService);
  private readonly userService = inject(UserService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly title = signal('calendar-app');

  ngOnInit(): void {
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
          if (event.type === KeycloakEventTypeLegacy.OnTokenExpired) {
            this.keycloakService.updateToken(20).catch(() => {
              this.keycloakService.login();
            });
          }

          if (event.type === KeycloakEventTypeLegacy.OnAuthRefreshError) {
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
      }
    } catch (err) {
      this.logger.error('App', 'Error checking login status:', err);
    }
  }
}
