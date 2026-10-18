import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, ParamMap, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { LOCALE_ID, signal } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FriendMemoriesComponent } from './friend-memories';
import { AvatarService } from '../../services/avatar.service';
import { FriendshipInsightsService } from '../../services/friendship-insights.service';
import { FriendshipMemories, MemoryEvent } from '../../models/friendship-insights.model';

registerLocaleData(localeFr);

describe('FriendMemoriesComponent', () => {
    let fixture: ComponentFixture<FriendMemoriesComponent>;
    let component: FriendMemoriesComponent;
    let params: BehaviorSubject<ParamMap>;
    let insights: { getMemories: ReturnType<typeof vi.fn> };

    const outing = (eventId: string, startDate: string, imageUrl: string | null = null): MemoryEvent =>
        ({ eventId, title: `Sortie ${eventId}`, startDate, imageUrl });
    const memories = (overrides: Partial<FriendshipMemories> = {}): FriendshipMemories => ({
        friendId: 'lea', name: 'Léa', closeness: 'INTIMATE', since: new Date(2025, 2, 3, 12).toISOString(), years: 1, days: 412,
        sharedCount: 14, first: outing('first', '2025-03-20T19:00:00Z'), last: outing('last', '2026-09-12T19:00:00Z'),
        highlights: [outing('h1', '2026-09-12T19:00:00Z', '/h1.jpg'), outing('h2', '2026-05-01T19:00:00Z')],
        ...overrides
    });

    const create = () => {
        fixture = TestBed.createComponent(FriendMemoriesComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    };
    const text = () => fixture.nativeElement.textContent as string;

    beforeEach(async () => {
        params = new BehaviorSubject(convertToParamMap({ userId: 'lea' }));
        insights = { getMemories: vi.fn().mockReturnValue(of(memories())) };
        await TestBed.configureTestingModule({
            imports: [FriendMemoriesComponent],
            providers: [
                provideRouter([]),
                { provide: LOCALE_ID, useValue: 'fr-FR' },
                { provide: ActivatedRoute, useValue: { paramMap: params } },
                { provide: FriendshipInsightsService, useValue: insights },
                { provide: AvatarService, useValue: { url: () => signal(null) } }
            ]
        }).compileComponents();
    });

    afterEach(() => vi.useRealTimers());

    it('template_shouldSayHowLongTheFriendshipLasts_andSinceWhen', () => {
        create();

        expect(insights.getMemories).toHaveBeenCalledWith('lea');
        expect(fixture.nativeElement.querySelector('h1').textContent).toContain('1 an d’amitié avec Léa');
        expect(text()).toContain('depuis le 3 mars 2025');
        expect(text()).toContain('14 sorties partagées');
    });

    it('template_shouldShowTheFirstAndLastOuting_andTheHighlights', () => {
        create();

        expect(text()).toContain('Votre première sortie');
        expect(text()).toContain('Sortie first');
        expect(text()).toContain('Votre dernière sortie');
        expect(fixture.nativeElement.querySelectorAll('.highlight')).toHaveLength(2);
        expect(fixture.nativeElement.querySelector('.highlight img').getAttribute('src')).toBe('/h1.jpg');
    });

    it('milestones_shouldShowOneOuting_whenTheFirstIsTheLast', () => {
        const only = outing('only', '2026-01-01T19:00:00Z');
        insights.getMemories.mockReturnValue(of(memories({ sharedCount: 1, first: only, last: only, highlights: [] })));
        create();

        expect(component.milestones()).toHaveLength(1);
        expect(text()).toContain('1 sortie partagée');
        expect(text()).toContain('Vos sorties ensemble apparaîtront ici.');
    });

    it('template_shouldCelebrate_onTheAnniversary', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 2, 3, 10));
        create();

        expect(component.anniversary()).toBe(true);
        expect(fixture.nativeElement.querySelector('.confetti')).not.toBeNull();
        expect(text()).toContain('anniversaire d’amitié aujourd’hui');
    });

    it('template_shouldNotCelebrate_anotherDay', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 2, 4, 10));
        create();

        expect(fixture.nativeElement.querySelector('.confetti')).toBeNull();
    });

    it('template_shouldSayTheyAreNotFriends_onA404', () => {
        insights.getMemories.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
        create();

        expect(component.page().state).toBe('notFriends');
        expect(text()).toContain('Vous n’êtes pas amis sur Wely.');
    });

    it('template_shouldSayTheyAreUnavailable_onAnyOtherFailure', () => {
        insights.getMemories.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
        create();

        expect(component.page().state).toBe('error');
        expect(text()).toContain('Souvenirs indisponibles');
    });

    it('open_shouldReadAnotherFriend_whenTheLinkChanges', () => {
        create();

        params.next(convertToParamMap({ userId: 'hugo' }));

        expect(insights.getMemories).toHaveBeenLastCalledWith('hugo');
        expect(component.friendId()).toBe('hugo');
    });
});
