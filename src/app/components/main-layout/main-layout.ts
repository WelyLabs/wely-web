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
  userProfile: KeycloakProfile | null = null;
  showUserMenu = false;

  constructor(
    private breakpointObserver: BreakpointObserver,
    private keycloak: KeycloakService,
    private router: Router
  ) { }

  async ngOnInit() {
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

    // Load user profile
    const isLoggedIn = await this.keycloak.isLoggedIn();
    if (isLoggedIn) {
      this.userProfile = await this.keycloak.loadUserProfile();
    }
  }

  toggleSidenav() {
    this.sidenav.toggle();
  }

  async logout() {
    await this.keycloak.logout(window.location.origin);
  }
}
