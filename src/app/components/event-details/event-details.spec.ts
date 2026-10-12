import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Subject, defer, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
    EventDetailsComponent, avatarColor, countdownOf, initialsOf, isSameDay, phaseOf
} from './event-details';
import { EventParticipants, EventService, FeedEvent } from '../../services/event.service';
import { SocialService } from '../../services/social.service';
import { UserService } from '../../services/user.service';
import { ChatService, PendingMessage } from '../../services/chat.service';
import { Conversation, ConversationType, Message, MessageType } from '../../models/chat.model';
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
    let socialService: {
        searchUsers: ReturnType<typeof vi.fn>;
        sendFriendRequest: ReturnType<typeof vi.fn>;
        acceptFriend: ReturnType<typeof vi.fn>;
    };
    const directory = () => [
        { userId: 'org', userName: 'Camille Durand', hashtag: 1111, relationStatus: 'FRIENDS' },
        { userId: 'f1', userName: 'Léo Martin', hashtag: 2222, relationStatus: 'FRIENDS' },
        { userId: 'u2', userName: 'Inès Bernard', hashtag: 3333, relationStatus: 'NONE' },
        { userId: 'u3', userName: 'Sami Kadi', hashtag: 4444, relationStatus: 'SENT_BY_THEM' },
        { userId: 'u4', userName: 'Zoé Petit', hashtag: 5555, relationStatus: 'SENT_BY_ME' }
    ];
    const me = new BehaviorSubject<User | null>({ id: 'me' } as User);
    let chatService: {
        getEventConversation: ReturnType<typeof vi.fn>;
        sendMessage: ReturnType<typeof vi.fn>;
        initializeStream: ReturnType<typeof vi.fn>;
        messages$: Subject<Message>;
    };

    const chatMessage = (overrides: Partial<Message> = {}): Message => ({
        id: 'm1', senderId: 'f1', senderName: 'leo', receiverId: 'me', conversationId: 'conv-1',
        content: 'Qui ramène les cartes ?', type: MessageType.TEXT, timestamp: '2026-10-12T09:00:00', reactions: {},
        ...overrides
    });

    const group = (messages: Message[] = []): Conversation => ({
        id: 'conv-1', participantIds: ['org', 'me', 'f1'], type: ConversationType.EVENT, updatedAt: '',
        messages, bucketIndex: 0
    });

    const participants = (overrides: Partial<EventParticipants> = {}): EventParticipants => ({
        count: 3, participantIds: [], friendsGoingIds: ['f1'], ...overrides
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
        chatService = {
            getEventConversation: vi.fn().mockReturnValue(of(group([chatMessage()]))),
            sendMessage: vi.fn(),
            initializeStream: vi.fn(),
            messages$: new Subject<Message>()
        };
        socialService = {
            searchUsers: vi.fn().mockImplementation(() => of(directory())),
            sendFriendRequest: vi.fn().mockReturnValue(of({})),
            acceptFriend: vi.fn().mockReturnValue(of(undefined))
        };

        TestBed.configureTestingModule({
            imports: [EventDetailsComponent],
            providers: [
                { provide: EventService, useValue: eventService },
                { provide: SocialService, useValue: socialService },
                { provide: ChatService, useValue: chatService },
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

    it('phase_shouldBeMemberAndShowTheGroupThreadOnceJoined', () => {
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['u2', 'me', 'f1'] })));

        create();

        expect(component.joined()).toBe(true);
        expect(component.phase()).toBe('member');
        expect(chatService.getEventConversation).toHaveBeenCalledWith('e1');
        expect(chatService.initializeStream).toHaveBeenCalled();
        const message = fixture.nativeElement.querySelector('.thread-message') as HTMLElement;
        expect(message.textContent).toContain('Léo Martin');
        expect(message.textContent).toContain('Qui ramène les cartes ?');
        expect(fixture.nativeElement.querySelector('.composer')).not.toBeNull();
    });

    it('followThread_shouldNotAskForTheGroupOfAGuest', () => {
        create();

        expect(chatService.getEventConversation).not.toHaveBeenCalled();
    });

    it('followThread_shouldAppendWhatArrivesLiveForThisGroupOnly', () => {
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me'] })));
        create();

        chatService.messages$.next(chatMessage({ id: 'm2', content: 'Moi !' }));
        chatService.messages$.next(chatMessage({ id: 'm3', conversationId: 'other', content: 'ailleurs' }));

        expect(component.thread().map(message => message.content)).toEqual(['Qui ramène les cartes ?', 'Moi !']);
    });

    it('followThread_shouldSayUnavailable_whenTheGroupCannotBeRead', () => {
        chatService.getEventConversation.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me'] })));

        create();

        expect(component.threadState()).toBe('unavailable');
        expect(fixture.nativeElement.textContent).toContain("Le fil n'est pas disponible");
    });

    it('followThread_shouldAskAgain_whileTheGroupIsBeingCreated', async () => {
        vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'setInterval'] });
        vi.setSystemTime(at('2026-10-12T10:00:00'));
        let calls = 0;
        // Deferred like a real HTTP call: retrying re-subscribes, which sends the request again.
        chatService.getEventConversation.mockReturnValue(defer(() => {
            calls += 1;
            return calls === 1 ? throwError(() => new HttpErrorResponse({ status: 404 })) : of(group());
        }));
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me'] })));

        create();
        expect(component.threadState()).toBe('loading');
        await vi.advanceTimersByTimeAsync(1_500);

        expect(component.threadState()).toBe('ready');
        expect(component.thread()).toEqual([]);
    });

    it('sendMessage_shouldShowTheMessageAtOnceThenSettleIt', () => {
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me'] })));
        const pending = { ...chatMessage({ id: 'pending-1', senderId: 'me', content: 'Je ramène Dixit' }), pending: true } as PendingMessage;
        chatService.sendMessage.mockReturnValue(of(pending, { ...pending, pending: false }));
        create();

        component.draft.set('  Je ramène Dixit ');
        component.sendMessage();

        expect(chatService.sendMessage).toHaveBeenCalledWith('conv-1', 'Je ramène Dixit', '');
        expect(component.draft()).toBe('');
        expect(component.thread().at(-1)).toEqual(expect.objectContaining({ id: 'pending-1', pending: false }));
        expect(component.thread()).toHaveLength(2);
        expect(component.authorOf(component.thread().at(-1)!)).toBe('Toi');
    });

    it('sendMessage_shouldSendNothing_forAnEmptyDraft', () => {
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me'] })));
        create();

        component.draft.set('   ');
        component.sendMessage();

        expect(chatService.sendMessage).not.toHaveBeenCalled();
    });

    it('template_shouldHideTheComposerOnceItIsOver', () => {
        vi.setSystemTime(at('2026-10-19T10:00:00'));
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me'] })));

        create();

        expect(fixture.nativeElement.querySelector('.thread-message')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('.composer')).toBeNull();
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

    it('people_shouldCarryWhereTheViewerStandsWithEach', () => {
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me', 'f1', 'u2', 'u3', 'u4'] })));

        create();

        expect(component.people().map(person => [person.id, person.relation])).toEqual([
            ['f1', 'FRIENDS'], ['me', 'ME'], ['u2', 'NONE'], ['u3', 'SENT_BY_THEM'], ['u4', 'SENT_BY_ME']
        ]);
        expect(component.strangers().map(person => person.id)).toEqual(['u2', 'u3']);
    });

    it('template_shouldNotListParticipantsToAGuest', () => {
        create();

        expect(fixture.nativeElement.querySelector('.people')).toBeNull();
    });

    it('addFriend_shouldSendTheTagWithTheEventThenRefreshTheStatuses', () => {
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me', 'u2'] })));
        create();

        (fixture.nativeElement.querySelector('.small-outline-button') as HTMLButtonElement).click();

        expect(socialService.sendFriendRequest).toHaveBeenCalledWith('Inès Bernard#3333', 'e1');
        expect(socialService.searchUsers).toHaveBeenCalledTimes(2);
        expect(component.sending().size).toBe(0);
    });

    it('addFriend_shouldReleaseThePersonWhenItFails', () => {
        socialService.sendFriendRequest.mockReturnValue(throwError(() => new Error('down')));
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me', 'u2'] })));
        create();

        component.addFriend(component.people().find(person => person.id === 'u2')!);

        expect(component.sending().size).toBe(0);
        expect(socialService.searchUsers).toHaveBeenCalledTimes(1);
    });

    it('acceptFriend_shouldAcceptAPendingRequestFromAParticipant', () => {
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me', 'u3'] })));
        create();

        (fixture.nativeElement.querySelector('.small-gradient-button') as HTMLButtonElement).click();

        expect(socialService.acceptFriend).toHaveBeenCalledWith('u3');
    });

    it('template_shouldInviteToAddPeopleMetOnceItIsOver', () => {
        vi.setSystemTime(at('2026-10-19T10:00:00'));
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me', 'f1', 'u2'] })));

        create();

        expect(component.phase()).toBe('past');
        expect(fixture.nativeElement.querySelector('.people-heading')?.textContent).toContain('Tu as passé ce moment avec 2 personnes');
    });

    it('goBack_shouldReturnToTheCalendar', () => {
        create();

        component.goBack();

        expect(router.navigate).toHaveBeenCalledWith(['/calendar']);
    });
});
