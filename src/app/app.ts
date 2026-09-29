import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { LoggerService } from './core/logging/logger.service';
import { RouterOutlet } from '@angular/router';
import { KeycloakService, KeycloakEventType } from 'keycloak-angular';
import { UserService } from './services/user.service';
import { Subscription, from } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
    private readonly logger = inject(LoggerService);
  private readonly keycloakService = inject(KeycloakService);
  private readonly userService = inject(UserService);

  protected readonly title = signal('calendar-app');
  private subscription = new Subscription();

  ngOnInit() {
    // Listener for Keycloak events
    this.subscription.add(
      this.keycloakService.keycloakEvents$.subscribe({
        next: (event) => {
          const type = event.type as any;
          if (type === KeycloakEventType.TokenExpired) {
            this.keycloakService.updateToken(20).catch(() => {
              this.keycloakService.login();
            });
          }

          if (type === KeycloakEventType.AuthRefreshError) {
            this.keycloakService.login();
          }
        }
      })
    );

    // Load user profile if logged in
    try {
      if (this.keycloakService.isLoggedIn()) {
        this.subscription.add(
          this.userService.loadAndSetCurrentUser().subscribe({
            next: (user) => this.logger.debug('App', 'User profile loaded:', user),
            error: (err) => this.logger.error('App', 'Error fetching user profile:', err)
          })
        );
      }
    } catch (err) {
      this.logger.error('App', 'Error checking login status:', err);
    }
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}
