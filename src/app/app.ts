import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { KeycloakService } from 'keycloak-angular';
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
    private keycloakService: KeycloakService,
    private userService: UserService
  ) { }

  async ngOnInit() {
    if (await this.keycloakService.isLoggedIn()) {
      this.userService.getMe().subscribe({
        next: (user) => console.log('User profile:', user),
        error: (err) => console.error('Error fetching user profile:', err)
      });
    }
  }
}
