import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';

import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { KeycloakService } from 'keycloak-angular';

@Component({
    selector: 'app-landing-page',
    standalone: true,
    imports: [RouterModule, MatButtonModule, MatIconModule],
    templateUrl: './landing-page.html',
    styleUrl: './landing-page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
/** Public home page: the only route reachable without a session. */
export class LandingPageComponent {
    private readonly router = inject(Router);
    private readonly keycloak = inject(KeycloakService);

    /** Static copy, so a plain array rather than a signal: nothing ever writes to it. */
    readonly features = [
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

    readonly showMobileMenu = signal(false);

    async launchApp(): Promise<void> {
        const isLoggedIn = await this.keycloak.isLoggedIn();

        if (isLoggedIn) {
            this.router.navigate(['/calendar']);
        } else {
            await this.keycloak.login({
                redirectUri: window.location.origin + '/calendar'
            });
        }
    }

    async signup(): Promise<void> {
        await this.keycloak.register({
            redirectUri: window.location.origin + '/calendar'
        });
    }

    toggleMenu(): void {
        this.showMobileMenu.update(open => !open);
    }
    /** Escape closes the mobile menu; its backdrop cannot take focus. */
    @HostListener('document:keydown.escape')
    onEscape(): void {
        if (this.showMobileMenu()) {
            this.closeMenu();
        }
    }

    /**
     * Closes the menu only when the backdrop itself was clicked.
     *
     * <p>The panel used to carry `(click)="$event.stopPropagation()"` so that clicking inside
     * it did not reach the backdrop. That made a plain div look like a control to every
     * accessibility checker, for a handler that did nothing but swallow an event. Comparing
     * target to currentTarget answers the same question without a second listener.
     */
    dismissIfBackdrop(event: Event): void {
        if (event.target === event.currentTarget) {
            this.closeMenu();
        }
    }

    closeMenu(): void {
        this.showMobileMenu.set(false);
    }
}
