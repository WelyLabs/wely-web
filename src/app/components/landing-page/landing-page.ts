import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { KeycloakService } from 'keycloak-angular';

@Component({
    selector: 'app-landing-page',
    standalone: true,
    imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule],
    templateUrl: './landing-page.html',
    styleUrl: './landing-page.scss'
})
export class LandingPageComponent {
    features = [
        {
            icon: 'calendar_today',
            title: 'Smart Calendar',
            description: 'Organize your life with our intuitive and beautiful calendar interface.'
        },
        {
            icon: 'event_note',
            title: 'Event Feed',
            description: 'Discover and subscribe to interesting events happening around you.'
        },
        {
            icon: 'chat',
            title: 'Real-time Chat',
            description: 'Connect with other attendees and discuss event details instantly.'
        }
    ];

    showMobileMenu = false;

    constructor(
        private router: Router,
        private keycloak: KeycloakService
    ) { }

    async launchApp() {
        const isLoggedIn = await this.keycloak.isLoggedIn();

        if (isLoggedIn) {
            this.router.navigate(['/calendar']);
        } else {
            await this.keycloak.login({
                redirectUri: window.location.origin + '/calendar'
            });
        }
    }

    async signup() {
        await this.keycloak.register({
            redirectUri: window.location.origin + '/calendar'
        });
    }

    toggleMenu() {
        this.showMobileMenu = !this.showMobileMenu;
    }

    closeMenu() {
        this.showMobileMenu = false;
    }
}
