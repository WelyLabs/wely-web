import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { KeycloakService, KeycloakEventType } from 'keycloak-angular';
import { UserService } from './services/user.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = signal('calendar-app');

  constructor(
    private readonly keycloakService: KeycloakService,
    private readonly userService: UserService
  ) { }

  async ngOnInit() {
    // Listener pour les événements Keycloak (ex: expiration de session)
    this.keycloakService.keycloakEvents$.subscribe({
      next: (event) => {
        const eventType = event.type as any;
        if (eventType === KeycloakEventType.TokenExpired || eventType === 'OnTokenExpired') {
          this.keycloakService.updateToken(20).catch(() => {
            this.keycloakService.login();
          });
        }

        if (eventType === KeycloakEventType.AuthRefreshError) {
          this.keycloakService.login();
        }
      }
    });

    if (await this.keycloakService.isLoggedIn()) {
      this.userService.loadAndSetCurrentUser().subscribe({
        next: (user) => console.log('User profile loaded:', user),
        error: (err) => console.error('Error fetching user profile:', err)
      });
    }
  }
}
