import { Component, ViewChild, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { KeycloakService } from 'keycloak-angular';
import { KeycloakProfile } from 'keycloak-js';
import { UserService } from '../../services/user.service';
import { UnifiedUser } from '../../models/user.model';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatToolbarModule
  ],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss'
})
export class MainLayoutComponent implements OnInit {
  @ViewChild('sidenav') sidenav!: MatSidenav;

  navItems = [
    { label: 'Calendar', icon: 'calendar_today', route: '/calendar' },
    { label: 'Event Feed', icon: 'event_note', route: '/feed' }
  ];

  isMobile = false;
  isOpened = true;
  userProfile: UnifiedUser | null = null;
  showUserMenu = false;

  constructor(
    private breakpointObserver: BreakpointObserver,
    private keycloak: KeycloakService,
    private userService: UserService,
    private router: Router
  ) { }

  ngOnInit() {
    this.breakpointObserver.observe([Breakpoints.Handset, Breakpoints.Tablet])
      .subscribe(result => {
        this.isMobile = result.matches;
        // Automatically open sidebar when switching to desktop, close when switching to mobile
        if (this.sidenav) {
          if (this.isMobile) {
            this.sidenav.close();
          } else {
            this.sidenav.open();
          }
        }
      });

    // Load user profile using UserService to get unified data
    this.userService.getMe().subscribe({
      next: (user) => {
        this.userProfile = user;
      },
      error: (err) => console.error('Error loading profile in layout:', err)
    });
  }

  toggleSidenav() {
    this.sidenav.toggle();
  }

  async logout() {
    await this.keycloak.logout(window.location.origin);
  }
}
