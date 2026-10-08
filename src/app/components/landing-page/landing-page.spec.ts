import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildWeek, feedBadge, LandingPageComponent, weekLabel } from './landing-page';
import { Router } from '@angular/router';
import { KeycloakService } from 'keycloak-angular';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('LandingPageComponent', () => {
    let component: LandingPageComponent;
    let fixture: ComponentFixture<LandingPageComponent>;
    let keycloakMock: { isLoggedIn: ReturnType<typeof vi.fn>; login: ReturnType<typeof vi.fn>; register: ReturnType<typeof vi.fn> };
    let routerMock: { navigate: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
        keycloakMock = {
            isLoggedIn: vi.fn().mockResolvedValue(false),
            login: vi.fn().mockResolvedValue({}),
            register: vi.fn().mockResolvedValue({})
        };
        routerMock = {
            navigate: vi.fn()
        };

        await TestBed.configureTestingModule({
            imports: [LandingPageComponent, NoopAnimationsModule],
        }).overrideComponent(LandingPageComponent, {
            set: {
                providers: [
                    { provide: KeycloakService, useValue: keycloakMock },
                    { provide: Router, useValue: routerMock }
                ]
            }
        }).compileComponents();

        fixture = TestBed.createComponent(LandingPageComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should navigate to calendar if already logged in when launching app', async () => {
        keycloakMock.isLoggedIn.mockResolvedValue(true);
        await component.launchApp();
        expect(routerMock.navigate).toHaveBeenCalledWith(['/calendar']);
        expect(keycloakMock.login).not.toHaveBeenCalled();
    });

    it('should call login if not logged in when launching app', async () => {
        keycloakMock.isLoggedIn.mockResolvedValue(false);
        await component.launchApp();
        expect(keycloakMock.login).toHaveBeenCalledWith({ redirectUri: window.location.origin + '/calendar' });
        expect(routerMock.navigate).not.toHaveBeenCalled();
    });

    it('should call register when signup is called', async () => {
        await component.signup();
        expect(keycloakMock.register).toHaveBeenCalledWith({ redirectUri: window.location.origin + '/calendar' });
    });

    it('should launch the app from the demo button and register from the secondary one', async () => {
        const host: HTMLElement = fixture.nativeElement;

        host.querySelector<HTMLButtonElement>('.hero .btn-primary')!.click();
        host.querySelector<HTMLButtonElement>('.hero .btn-secondary')!.click();
        await fixture.whenStable();

        expect(keycloakMock.isLoggedIn).toHaveBeenCalled();
        expect(keycloakMock.register).toHaveBeenCalled();
    });

    it('should expose the three feature cards the template renders', () => {
        expect(component.features).toHaveLength(3);
        expect(component.features.map(feature => feature.icon))
            .toEqual(['calendar_today', 'event_note', 'chat']);
        expect(fixture.nativeElement.querySelectorAll('.feature')).toHaveLength(3);
    });

    it('should render one preview card per event, inside the seven-day grid', () => {
        expect(fixture.nativeElement.querySelectorAll('.week-grid .event')).toHaveLength(component.previewEvents.length);
        for (const event of component.previewEvents) {
            expect(event.weekday).toBeGreaterThanOrEqual(0);
            expect(event.weekday).toBeLessThan(7);
        }
    });

    it('should mark exactly one day of the preview as today', () => {
        expect(fixture.nativeElement.querySelectorAll('.day-head.today')).toHaveLength(1);
    });
});

describe('buildWeek', () => {
    it('should start on Monday and mark today, for a Wednesday', () => {
        const week = buildWeek(new Date(2026, 9, 7)); // Wednesday 7 October 2026

        expect(week.map(day => day.date)).toEqual([5, 6, 7, 8, 9, 10, 11]);
        expect(week.map(day => day.label)).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
        expect(week.filter(day => day.isToday).map(day => day.date)).toEqual([7]);
    });

    it('should keep a Sunday in the week that ends with it, not the next one', () => {
        const week = buildWeek(new Date(2026, 9, 11)); // Sunday

        expect(week[0].date).toBe(5);
        expect(week[6]).toEqual({ label: 'SUN', date: 11, isToday: true });
    });

    it('should cross a month boundary', () => {
        const week = buildWeek(new Date(2026, 9, 1)); // Thursday 1 October 2026

        expect(week.map(day => day.date)).toEqual([28, 29, 30, 1, 2, 3, 4]);
    });
});

describe('weekLabel', () => {
    it('should number weeks the ISO way', () => {
        expect(weekLabel(new Date(2026, 9, 7))).toBe('Semaine 41, 2026');
    });

    it('should give the first days of January to the previous year when ISO says so', () => {
        // 1 January 2027 is a Friday: it belongs to week 53 of 2026.
        expect(weekLabel(new Date(2027, 0, 1))).toBe('Semaine 53, 2026');
    });

    it('should give the last days of December to the next year when ISO says so', () => {
        // 30 December 2025 is a Tuesday: week 1 of 2026.
        expect(weekLabel(new Date(2025, 11, 30))).toBe('Semaine 1, 2026');
    });
});

describe('feedBadge', () => {
    it('should print the month and a two-digit day, as the feed card does', () => {
        expect(feedBadge(new Date(2026, 9, 1), 4)).toEqual({ month: 'OCT', day: '05' });
    });

    it('should roll over to the next month', () => {
        expect(feedBadge(new Date(2026, 9, 30), 4)).toEqual({ month: 'NOV', day: '03' });
    });
});
