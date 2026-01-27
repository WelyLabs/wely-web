import { Component, OnInit, OnDestroy, signal } from '@angular/core';
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
  protected readonly title = signal('calendar-app');
  private subscription = new Subscription();

  constructor(
    private readonly keycloakService: KeycloakService,
    private readonly userService: UserService
  ) { }

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
            next: (user) => console.log('User profile loaded:', user),
            error: (err) => console.error('Error fetching user profile:', err)
          })
        );
      }
    } catch (err) {
      console.error('Error checking login status:', err);
    }
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}
