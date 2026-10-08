import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { KeycloakService } from 'keycloak-angular';

/** One day column of the calendar preview in the hero. */
export interface PreviewDay {
    label: string;
    date: number;
    isToday: boolean;
}

/** An event card of the calendar preview, placed by weekday and by row. */
export interface PreviewEvent {
    title: string;
    /** 0 = Monday, as in the app's week view. */
    weekday: number;
    /** Row in the preview grid, 1-based, one row per two hours from 08:00. */
    row: number;
    span: number;
}

const WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MS_PER_DAY = 86_400_000;

/** The seven days of the week holding `today`, Monday first, as the app's week view lays them out. */
export function buildWeek(today: Date): PreviewDay[] {
    const mondayOffset = (today.getDay() + 6) % 7;
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset);
    return WEEKDAY_LABELS.map((label, index) => {
        const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index);
        return { label, date: day.getDate(), isToday: index === mondayOffset };
    });
}

/**
 * The date badge of a feed card, as the app prints it: "OCT" over "12". The demo's
 * vinyl-listening evening is four days from today, so the badge is too.
 */
export function feedBadge(today: Date, daysAhead: number): { month: string; day: string } {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysAhead);
    return {
        month: date.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
        day: String(date.getDate()).padStart(2, '0')
    };
}

/** "Semaine 41, 2026": the title of the app's week view, ISO 8601 week numbering. */
export function weekLabel(today: Date): string {
    const thursday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
    const firstJanuary = Date.UTC(thursday.getUTCFullYear(), 0, 1);
    const week = Math.ceil(((thursday.getTime() - firstJanuary) / MS_PER_DAY + 1) / 7);
    return `Semaine ${week}, ${thursday.getUTCFullYear()}`;
}

@Component({
    selector: 'app-landing-page',
    standalone: true,
    imports: [MatIconModule],
    templateUrl: './landing-page.html',
    styleUrl: './landing-page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
/** Public home page: the only route reachable without a session. */
export class LandingPageComponent {
    private readonly router = inject(Router);
    private readonly keycloak = inject(KeycloakService);

    readonly repositoryUrl = 'https://github.com/WelyLabs/wely-platform';

    /** Static copy, so plain arrays rather than signals: nothing ever writes to them. */
    readonly features = [
        {
            icon: 'calendar_today',
            title: 'Un agenda partagé',
            description: 'Vos événements et ceux de vos amis auxquels vous participez, au mois, à la semaine ou au jour.'
        },
        {
            icon: 'event_note',
            title: 'Un fil d\'événements',
            description: 'Ce que vos amis organisent défile carte par carte. Un geste, et l\'événement rejoint votre agenda.'
        },
        {
            icon: 'chat',
            title: 'Un chat en temps réel',
            description: 'Pour caler l\'heure ou le covoiturage, sans changer d\'application. Les messages arrivent sans recharger.'
        }
    ];

    readonly stack = [
        'Spring WebFlux', 'Project Reactor', 'RSocket', 'Kafka', 'PostgreSQL · R2DBC', 'Neo4j',
        'MongoDB', 'Keycloak', 'Angular 21 · signals', 'k3s · Argo CD'
    ];

    /**
     * The preview shows the real week around today, like the app's week view does. The events
     * echo the public demo account, so what the hero promises is what the demo shows. Their
     * titles are short because a column is about 55px wide here.
     */
    readonly week = buildWeek(new Date());
    readonly weekTitle = weekLabel(new Date());
    readonly feedDate = feedBadge(new Date(), 4);
    readonly previewEvents: PreviewEvent[] = [
        { title: 'Coworking', weekday: 0, row: 1, span: 2 },
        { title: 'Afterwork', weekday: 1, row: 6, span: 1 },
        { title: 'Atelier Angular', weekday: 2, row: 6, span: 2 },
        { title: 'Concert', weekday: 3, row: 7, span: 1 },
        { title: 'Rando', weekday: 5, row: 1, span: 4 },
        { title: 'Brunch', weekday: 6, row: 2, span: 2 }
    ];

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
}
