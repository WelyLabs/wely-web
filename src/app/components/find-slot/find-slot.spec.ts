import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FindSlotComponent, MAX_FRIENDS, TimeWindow } from './find-slot';
import { EventService, FreeRange } from '../../services/event.service';
import { SocialService } from '../../services/social.service';
import { UserNodeDTO } from '../../models/user.model';

describe('FindSlotComponent', () => {
    let fixture: ComponentFixture<FindSlotComponent>;
    let component: FindSlotComponent;
    let findFreeSlots: ReturnType<typeof vi.fn>;
    let listFriends: ReturnType<typeof vi.fn>;

    const window: TimeWindow = {
        start: new Date('2026-10-16T08:00:00Z'),
        end: new Date('2026-10-16T20:00:00Z')
    };
    const friends: UserNodeDTO[] = [
        { userId: 'u-2', userName: 'Zoé', hashtag: 2 },
        { userId: 'u-1', userName: 'Alice', hashtag: 1 }
    ];
    const free: FreeRange = { start: new Date('2026-10-16T14:00:00Z'), end: new Date('2026-10-16T18:00:00Z') };

    const create = (searchWindow: TimeWindow = window) => {
        fixture = TestBed.createComponent(FindSlotComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('window', searchWindow);
        fixture.detectChanges();
    };

    beforeEach(async () => {
        findFreeSlots = vi.fn().mockReturnValue(of([free]));
        listFriends = vi.fn().mockReturnValue(of(friends));

        await TestBed.configureTestingModule({
            imports: [FindSlotComponent],
            providers: [
                { provide: EventService, useValue: { findFreeSlots } },
                { provide: SocialService, useValue: { listFriends } }
            ]
        }).compileComponents();
        create();
    });

    it('constructor_shouldLoadFriendsSortedByName', () => {
        expect(component.friends()?.map(f => f.userName)).toEqual(['Alice', 'Zoé']);
    });

    it('constructor_shouldNotMutateTheListItReceived', () => {
        expect(friends.map(f => f.userName)).toEqual(['Zoé', 'Alice']);
    });

    it('constructor_shouldFlagAnError_whenFriendsCannotBeLoaded', () => {
        listFriends.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 502 })));
        create();

        expect(component.friendsError()).toBe(true);
        expect(fixture.nativeElement.textContent).toContain('Impossible de charger vos amis');
    });

    it('toggle_shouldAddThenRemoveAFriend', () => {
        component.toggle('u-1');
        expect(component.isSelected('u-1')).toBe(true);

        component.toggle('u-1');
        expect(component.isSelected('u-1')).toBe(false);
    });

    it('toggle_shouldClearPreviousResults', () => {
        component.toggle('u-1');
        component.search();

        component.toggle('u-2');

        expect(component.results()).toBeNull();
    });

    it('canSearch_shouldBeFalse_whenNoFriendIsSelected', () => {
        expect(component.canSearch()).toBe(false);
    });

    it('canSearch_shouldBeFalse_whenTooManyFriendsAreSelected', () => {
        for (let i = 0; i <= MAX_FRIENDS; i++) {
            component.toggle(`u-${i}`);
        }
        expect(component.canSearch()).toBe(false);
    });

    it('durations_shouldOnlyOfferWhatFitsInTheWindow', () => {
        create({ start: window.start, end: new Date(window.start.getTime() + 45 * 60_000) });

        expect(component.durations()).toEqual([15, 30]);
        expect(component.durationMinutes()).toBe(30);
    });

    it('durations_shouldDefaultToOneHour_whenItFits', () => {
        expect(component.durationMinutes()).toBe(60);
    });

    it('setDuration_shouldChangeTheDurationAndClearResults', () => {
        component.toggle('u-1');
        component.search();

        component.setDuration(90);

        expect(component.durationMinutes()).toBe(90);
        expect(component.results()).toBeNull();
    });

    it('search_shouldSendTheWindowTheFriendsAndTheDuration', () => {
        component.toggle('u-1');
        component.search();

        expect(findFreeSlots).toHaveBeenCalledWith({
            friendIds: ['u-1'], start: window.start, end: window.end, durationMinutes: 60
        });
        expect(component.results()).toEqual([free]);
    });

    it('search_shouldDoNothing_whenNoFriendIsSelected', () => {
        component.search();

        expect(findFreeSlots).not.toHaveBeenCalled();
    });

    it('search_shouldShowSearchingUntilTheAnswerArrives', () => {
        const answer = new Subject<FreeRange[]>();
        findFreeSlots.mockReturnValue(answer);
        component.toggle('u-1');

        component.search();
        expect(component.searching()).toBe(true);

        answer.next([]);
        answer.complete();
        expect(component.searching()).toBe(false);
    });

    it('search_shouldSayNothingIsFree_whenNoRangeComesBack', () => {
        findFreeSlots.mockReturnValue(of([]));
        component.toggle('u-1');
        component.search();
        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain('Aucun créneau commun');
    });

    it.each([
        [403, 'ne fait plus partie de vos amis'],
        [502, 'momentanément introuvables'],
        [400, 'Recherche impossible'],
        [500, 'Une erreur est survenue']
    ])('search_shouldExplainA%sAnswer', (status, message) => {
        findFreeSlots.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
        component.toggle('u-1');

        component.search();

        expect(component.errorMessage()).toContain(message);
        expect(component.results()).toBeNull();
    });

    it('pick_shouldEmitTheChosenDurationFromTheStartOfTheRange', () => {
        const picked = vi.fn();
        component.picked.subscribe(picked);
        component.setDuration(90);

        component.pick(free);

        expect(picked).toHaveBeenCalledWith({
            start: free.start,
            end: new Date('2026-10-16T15:30:00Z')
        });
    });

    it('sameDay_shouldTellWhetherARangeEndsOnItsStartDay', () => {
        expect(component.sameDay(free)).toBe(true);
        expect(component.sameDay({ start: free.start, end: new Date('2026-10-18T12:00:00Z') })).toBe(false);
    });

    it('formatDuration_shouldReadAsMinutesOrHours', () => {
        expect(component.formatDuration(30)).toBe('30 min');
        expect(component.formatDuration(120)).toBe('2 h');
        expect(component.formatDuration(90)).toBe('1 h 30');
    });
});
