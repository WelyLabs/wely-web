import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
    EventDetailsComponent, avatarColor, countdownOf, initialsOf, isSameDay, phaseOf
} from './event-details';
import { EventParticipants, EventService, FeedEvent } from '../../services/event.service';
import { SocialService } from '../../services/social.service';
import { UserService } from '../../services/user.service';
import { User } from '../../models/user.model';

const at = (iso: string) => new Date(iso);

const event = (overrides: Partial<FeedEvent> = {}): FeedEvent => ({
    id: 'e1',
    title: 'Soirée jeux',
    organizerId: 'org',
    startDate: at('2026-10-18T19:30:00'),
    endDate: at('2026-10-18T23:30:00'),
    location: 'Le Transbordeur',
    image: '',
    description: 'Ramenez vos jeux',
    ...overrides
});

describe('event page helpers', () => {
    it('phaseOf_shouldBePastOnceTheEventHasEnded', () => {
        expect(phaseOf(event(), true, at('2026-10-19T00:00:00'))).toBe('past');
        expect(phaseOf(event(), false, at('2026-10-19T00:00:00'))).toBe('past');
    });

    it('phaseOf_shouldBeGuestForSomeoneNotTakingPart', () => {
        expect(phaseOf(event(), false, at('2026-10-18T20:00:00'))).toBe('guest');
    });

    it('phaseOf_shouldBeMemberBeforeTheDay', () => {
        expect(phaseOf(event(), true, at('2026-10-12T10:00:00'))).toBe('member');
    });

    it('phaseOf_shouldBeLiveOnTheDayAndWhileItRuns', () => {
        expect(phaseOf(event(), true, at('2026-10-18T08:00:00'))).toBe('live');
        expect(phaseOf(event({ startDate: at('2026-10-17T22:00:00') }), true, at('2026-10-18T01:00:00'))).toBe('live');
    });

    it('countdownOf_shouldCountDaysThenTomorrowThenHours', () => {
        expect(countdownOf(event(), at('2026-10-12T23:00:00'))).toBe('Dans 6 jours');
        expect(countdownOf(event(), at('2026-10-17T09:00:00'))).toBe('Demain');
        expect(countdownOf(event(), at('2026-10-18T17:15:00'))).toBe('Commence dans 2 h 15');
        expect(countdownOf(event(), at('2026-10-18T19:10:00'))).toBe('Commence dans 20 min');
    });

    it('countdownOf_shouldSayWhenItRunsOrIsOver', () => {
        expect(countdownOf(event(), at('2026-10-18T20:00:00'))).toBe('En cours');
        expect(countdownOf(event(), at('2026-10-19T00:00:00'))).toBe('Terminé');
    });

    it('initialsOf_shouldTakeTwoLetters', () => {
        expect(initialsOf('Camille Durand')).toBe('CD');
        expect(initialsOf('camille')).toBe('CA');
        expect(initialsOf('  ')).toBe('?');
    });

    it('avatarColor_shouldBeStablePerPerson', () => {
        expect(avatarColor('u1')).toBe(avatarColor('u1'));
        expect(avatarColor('u1')).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('isSameDay_shouldIgnoreTheTime', () => {
        expect(isSameDay(at('2026-10-18T01:00:00'), at('2026-10-18T23:00:00'))).toBe(true);
        expect(isSameDay(at('2026-10-18T23:00:00'), at('2026-10-19T01:00:00'))).toBe(false);
    });
});

describe('EventDetailsComponent', () => {
    let fixture: ComponentFixture<EventDetailsComponent>;
    let component: EventDetailsComponent;
    let eventService: {
        getEvent: ReturnType<typeof vi.fn>;
        getParticipants: ReturnType<typeof vi.fn>;
        toggleSubscription: ReturnType<typeof vi.fn>;
    };
    let router: { navigate: ReturnType<typeof vi.fn> };
    const me = new BehaviorSubject<User | null>({ id: 'me' } as User);

    const participants = (overrides: Partial<EventParticipants> = {}): EventParticipants => ({
        count: 3, participantIds: [], friendIds: ['f1'], ...overrides
    });

    function create(): void {
        fixture = TestBed.createComponent(EventDetailsComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }

    beforeEach(() => {
        vi.stubGlobal('IntersectionObserver', class {
            observe = vi.fn();
            disconnect = vi.fn();
        });
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(at('2026-10-12T10:00:00'));

        eventService = {
            getEvent: vi.fn().mockReturnValue(of(event())),
            getParticipants: vi.fn().mockReturnValue(of(participants())),
            toggleSubscription: vi.fn().mockReturnValue(of(event()))
        };
        router = { navigate: vi.fn() };

        TestBed.configureTestingModule({
            imports: [EventDetailsComponent],
            providers: [
                { provide: EventService, useValue: eventService },
                { provide: SocialService, useValue: { searchUsers: () => of([
                    { userId: 'org', userName: 'Camille Durand' },
                    { userId: 'f1', userName: 'Léo Martin' },
                    { userId: 'u2', userName: 'Inès Bernard' }
                ]) } },
                { provide: UserService, useValue: { currentUser$: me } },
                { provide: Router, useValue: router },
                { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: (key: string) => key === 'id' ? 'e1' : 'feed' } } } }
            ]
        });
    });

    afterEach(() => vi.useRealTimers());

    it('ngOnInit_shouldLoadTheEventAndItsParticipantsById', () => {
        create();

        expect(eventService.getEvent).toHaveBeenCalledWith('e1');
        expect(eventService.getParticipants).toHaveBeenCalledWith('e1');
        expect(component.event()?.title).toBe('Soirée jeux');
    });

    it('ngOnInit_shouldShowNotFoundWhenTheEventIsHidden', () => {
        eventService.getEvent.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

        create();

        expect(component.notFound()).toBe(true);
        expect(fixture.nativeElement.textContent).toContain('Événement introuvable');
    });

    it('phase_shouldBeGuestAndLockTheTimelineForSomeoneNotTakingPart', () => {
        create();

        expect(component.joined()).toBe(false);
        expect(component.phase()).toBe('guest');
        expect(fixture.nativeElement.querySelector('.locked')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('.timeline')).toBeNull();
    });

    it('friendsSentence_shouldNameTheFriendsGoing', () => {
        create();

        expect(component.friendsSentence()).toBe('Léo y va');
        expect(fixture.nativeElement.textContent).toContain('Léo y va');
    });

    it('phase_shouldBeMemberAndShowTheTimelineOnceJoined', () => {
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['u2', 'me', 'f1'] })));

        create();

        expect(component.joined()).toBe(true);
        expect(component.phase()).toBe('member');
        const items = Array.from(fixture.nativeElement.querySelectorAll('.timeline-item')) as HTMLElement[];
        expect(items.map(item => item.textContent?.trim())).toEqual([
            expect.stringContaining('Inès Bernard a rejoint'),
            expect.stringContaining('Toi as rejoint'),
            expect.stringContaining('Léo Martin a rejoint')
        ]);
    });

    it('people_shouldListFriendsFirst', () => {
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['u2', 'f1'] })));

        create();

        expect(component.people().map(person => person.id)).toEqual(['f1', 'u2']);
    });

    it('phase_shouldTreatTheOrganizerAsAMember', () => {
        eventService.getEvent.mockReturnValue(of(event({ organizerId: 'me' })));

        create();

        expect(component.isOrganizer()).toBe(true);
        expect(component.phase()).toBe('member');
        expect(fixture.nativeElement.textContent).toContain('Organisateur');
    });

    it('phase_shouldGoLiveOnTheDay', () => {
        vi.setSystemTime(at('2026-10-18T17:15:00'));
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me'] })));

        create();

        expect(component.phase()).toBe('live');
        expect(fixture.nativeElement.querySelector('.live-countdown')?.textContent).toContain('Commence dans 2 h 15');
    });

    it('toggleParticipation_shouldJoinThenReloadTheParticipants', () => {
        create();
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me'] })));

        (fixture.nativeElement.querySelector('.action-bar .gradient-button') as HTMLButtonElement).click();

        expect(eventService.toggleSubscription).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
        expect(eventService.getParticipants).toHaveBeenCalledTimes(2);
        expect(component.joined()).toBe(true);
        expect(component.busy()).toBe(false);
    });

    it('toggleParticipation_shouldReleaseTheButtonWhenItFails', () => {
        eventService.toggleSubscription.mockReturnValue(throwError(() => new Error('down')));
        create();

        component.toggleParticipation();

        expect(component.busy()).toBe(false);
        expect(eventService.getParticipants).toHaveBeenCalledTimes(1);
    });

    it('mapUrl_shouldSearchTheTypedLocationWhenThereAreNoCoordinates', () => {
        create();

        expect(component.mapUrl()).toBe('https://www.openstreetmap.org/search?query=Le%20Transbordeur');
    });

    it('goBack_shouldReturnToTheCalendar', () => {
        create();

        component.goBack();

        expect(router.navigate).toHaveBeenCalledWith(['/calendar']);
    });
});
