import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { YearFriendsComponent } from './year-friends';
import { AvatarService } from '../../services/avatar.service';
import { ProfileSummary } from '../../services/event.service';

describe('YearFriendsComponent', () => {
    let fixture: ComponentFixture<YearFriendsComponent>;
    let component: YearFriendsComponent;

    const summary = (overrides: Partial<ProfileSummary> = {}): ProfileSummary => ({
        outingsThisYear: 0, outingsThisMonth: 0, organizedThisYear: 0, placesThisYear: 0, upcoming: [], memories: [],
        pastCount: 0, circle: [], places: [], balances: [], ...overrides
    });
    const names = new Map([['lea', 'Léa'], ['hugo', 'Hugo'], ['max', 'Max'], ['zoe', 'Zoé']]);

    const render = (value: ProfileSummary) => {
        fixture = TestBed.createComponent(YearFriendsComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('summary', value);
        fixture.componentRef.setInput('names', names);
        fixture.detectChanges();
    };
    const text = () => fixture.nativeElement.textContent as string;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [YearFriendsComponent],
            providers: [provideRouter([]), { provide: AvatarService, useValue: { url: () => signal(null) } }]
        }).compileComponents();
    });

    it('template_shouldListTheNewFriends', () => {
        render(summary({ newFriendsThisYear: [{ userId: 'lea', since: '2026-02-01T10:00:00Z' }, { userId: 'hugo', since: '2026-05-01T10:00:00Z' }] }));

        expect(text()).toContain('2 nouveaux amis cette année');
        expect(text()).toContain('Léa');
        expect(fixture.nativeElement.querySelector('.faces a').getAttribute('href')).toBe('/friends/lea');
    });

    it('newFriendsTitle_shouldAgreeWithOne', () => {
        render(summary({ newFriendsThisYear: [{ userId: 'lea', since: '2026-02-01T10:00:00Z' }] }));

        expect(component.newFriendsTitle()).toBe('1 nouvel ami cette année');
    });

    it('template_shouldSayWhoGotCloser_andWhen', () => {
        render(summary({ upgradesThisYear: [{ userId: 'lea', closeness: 'INTIMATE', at: new Date(2026, 2, 10).toISOString() }] }));

        expect(text()).toContain('Avec Léa, vous êtes devenus intimes en mars');
    });

    it('template_shouldRankTheTopThreeCompanions', () => {
        render(summary({
            topFriendsThisYear: [
                { userId: 'lea', outingsTogether: 9 }, { userId: 'hugo', outingsTogether: 4 },
                { userId: 'max', outingsTogether: 1 }, { userId: 'zoe', outingsTogether: 1 }
            ]
        }));

        expect(component.companions().map(companion => companion.medal)).toEqual(['🥇', '🥈', '🥉']);
        expect(text()).toContain('9 sorties ensemble');
        expect(text()).toContain('1 sortie ensemble');
        expect(text()).not.toContain('Zoé');
    });

    it('template_shouldNameSomeoneTheDirectoryDoesNotKnow', () => {
        render(summary({ topFriendsThisYear: [{ userId: 'ghost', outingsTogether: 2 }] }));

        expect(text()).toContain('Quelqu’un');
    });

    it('template_shouldShowNothing_whenTheYearHasNoFriendNews', () => {
        render(summary());

        expect(component.empty()).toBe(true);
        expect(fixture.nativeElement.querySelector('.year-friends')).toBeNull();
    });
});
