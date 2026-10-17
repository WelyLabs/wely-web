import { CallService } from '../../services/call.service';
import { callServiceStub } from '../../../testing/call-service.stub';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, NEVER, Subject, defer, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
    EventDetailsComponent, THREAD_PREVIEW_SIZE, countdownOf, isSameDay, phaseOf
} from './event-details';
import { EventParticipants, EventService, FeedEvent, Poll } from '../../services/event.service';
import { PollStreamService } from '../../services/poll-stream.service';
import { SocialService } from '../../services/social.service';
import { ExpenseService } from '../../services/expense.service';
import { ScheduleService } from '../../services/schedule.service';
import { UserService } from '../../services/user.service';
import { ChatService } from '../../services/chat.service';
import { NavigationService } from '../../services/navigation.service';
import { NotificationService } from '../../services/notification.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog';
import { HandOverDialogComponent } from '../hand-over-dialog/hand-over-dialog';
import { Conversation, ConversationType, Message, MessageType } from '../../models/chat.model';
import { User } from '../../models/user.model';
import { MatDialog } from '@angular/material/dialog';
import { EventCoverDialogComponent } from '../event-cover-dialog/event-cover-dialog';
import { DeletedUsersService } from '../../services/deleted-users.service';
import { deletedUsersStub } from '../../../testing/deleted-users.stub';

// ChatService is only provided as a token here, but importing it loads rsocket-js: replaced by the
// shared stub, as in every spec that pulls the service in, so no file gets the real module first.
vi.mock('rsocket-core', () => import('../../../testing/rsocket-core.stub'));
vi.mock('rsocket-websocket-client', () => import('../../../testing/rsocket-websocket-client.stub'));

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
        removeCover: ReturnType<typeof vi.fn>;
        leave: ReturnType<typeof vi.fn>;
        calendarFileUrl: ReturnType<typeof vi.fn>;
    };
    let notifications: { showInfo: ReturnType<typeof vi.fn> };
    let dialog: { open: ReturnType<typeof vi.fn> };
    let pollStream: { follow: ReturnType<typeof vi.fn> };
    let router: { navigate: ReturnType<typeof vi.fn> };
    let navigation: { back: ReturnType<typeof vi.fn> };
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
    let schedule: { getConflicts: ReturnType<typeof vi.fn> };
    let calls: ReturnType<typeof callServiceStub>;
    let deletedUsers: ReturnType<typeof deletedUsersStub>;
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
            toggleSubscription: vi.fn().mockReturnValue(of(event())),
            removeCover: vi.fn().mockReturnValue(of(undefined)),
            leave: vi.fn().mockReturnValue(of({ deleted: false, event: event() })),
            calendarFileUrl: vi.fn().mockReturnValue(of('/api/v1/events-service/public/calendar/tok.ics'))
        };
        notifications = { showInfo: vi.fn() };
        dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(undefined) }) };
        calls = callServiceStub();
        // « gone » deleted their account: wely-social no longer lists them.
        deletedUsers = deletedUsersStub(['gone']);
        schedule = { getConflicts: vi.fn().mockReturnValue(of([])) };
        pollStream = { follow: vi.fn().mockReturnValue(NEVER) };
        router = { navigate: vi.fn() };
        navigation = { back: vi.fn() };
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
                // The expenses card loads its own data: an empty account, so it renders without a backend.
                { provide: ExpenseService, useValue: {
                    list: vi.fn().mockReturnValue(of([])),
                    ledger: vi.fn().mockReturnValue(of({ currency: 'EUR', totalCents: 0, balances: [], transfers: [] }))
                } },
                { provide: ChatService, useValue: chatService },
                { provide: CallService, useValue: calls },
                // The conflicts card asks on its own: no conflict, so it stays hidden.
                { provide: ScheduleService, useValue: schedule },
                { provide: UserService, useValue: { currentUser$: me } },
                { provide: Router, useValue: router },
                { provide: NavigationService, useValue: navigation },
                { provide: MatDialog, useValue: dialog },
                { provide: NotificationService, useValue: notifications },
                { provide: PollStreamService, useValue: pollStream },
                { provide: DeletedUsersService, useValue: deletedUsers },
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

    it('openPerson_shouldOpenTheOrganizersPage_fromTheOrganizerLine', () => {
        create();

        (fixture.nativeElement.querySelector('.organizer .person-link') as HTMLButtonElement).click();

        expect(router.navigate).toHaveBeenCalledWith(['/friends', 'org']);
    });

    it('openPerson_shouldOpenMyProfile_forMe', () => {
        create();

        component.openPerson('me');

        expect(router.navigate).toHaveBeenCalledWith(['/profile']);
    });

    it('template_shouldOpenAFriendsPage_fromTheAvatarsOfWhoComes', () => {
        create();

        (fixture.nativeElement.querySelector('.who button.avatar') as HTMLButtonElement).click();

        expect(router.navigate).toHaveBeenCalledWith(['/friends', 'f1']);
    });

    it('template_shouldOpenEachPersonsPage_fromThePeopleList', () => {
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['u2', 'me', 'f1'] })));
        create();

        const rows = [...fixture.nativeElement.querySelectorAll('.person-open')] as HTMLButtonElement[];
        rows.forEach(row => row.click());

        expect(router.navigate.mock.calls.map(call => call[0])).toEqual(
            expect.arrayContaining([['/friends', 'u2'], ['/friends', 'f1'], ['/profile']]));
    });

    it('phase_shouldBeMemberAndShowTheGroupThreadOnceJoined', () => {
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['u2', 'me', 'f1'] })));

        create();

        expect(component.joined()).toBe(true);
        expect(component.phase()).toBe('member');
        expect(chatService.getEventConversation).toHaveBeenCalledWith('e1');
        expect(chatService.initializeStream).toHaveBeenCalled();
        const message = fixture.nativeElement.querySelector('app-chat-bubble') as HTMLElement;
        expect(message.textContent).toContain('Léo Martin');
        expect(message.textContent).toContain('Qui ramène les cartes ?');
        expect(fixture.nativeElement.querySelector('.open-discussion')).not.toBeNull();
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

    it('threadPreview_shouldKeepTheLastMessagesAndCountTheOthers', () => {
        const messages = ['un', 'deux', 'trois', 'quatre', 'cinq'].map((content, i) =>
            chatMessage({ id: `m${i}`, content, timestamp: `2026-10-12T09:0${i}:00` }));
        chatService.getEventConversation.mockReturnValue(of(group(messages)));
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me'] })));

        create();

        expect(component.threadPreview().map(message => message.text)).toEqual(['trois', 'quatre', 'cinq']);
        expect(fixture.nativeElement.querySelectorAll('app-chat-bubble').length).toBe(THREAD_PREVIEW_SIZE);
        expect(fixture.nativeElement.textContent).toContain('2 messages plus tôt');
    });

    it('threadPreview_shouldShowADateFixedNotice_asASystemLine', () => {
        const notice = chatMessage({ id: 'sys', senderId: 'system', senderName: 'Wely', type: MessageType.SYSTEM,
            content: '📅 Date fixée : jeudi 15 octobre, 19:00 – 21:00' });
        chatService.getEventConversation.mockReturnValue(of(group([chatMessage(), notice])));
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me'] })));

        create();

        const shown = component.threadPreview().at(-1);
        expect(shown?.system).toBe(true);
        expect(shown?.senderName).toBe('Wely');
        expect(fixture.nativeElement.querySelector('.system-notice')?.textContent).toContain('Date fixée');
    });

    describe('group call', () => {
        const live = {
            id: 'call-1', conversationId: 'conv-1', startedBy: 'f1', media: 'VIDEO' as const, status: 'ACTIVE' as const,
            startedAt: '2026-10-12T10:00:00Z', endedAt: null, memberIds: ['org', 'me', 'f1'], participants: [],
        };

        it('template_shouldOfferMembersAGroupCall_andStartIt', async () => {
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me'] })));
            calls.start.mockResolvedValue(live);
            create();

            const button = [...fixture.nativeElement.querySelectorAll('button')]
                .find((candidate: HTMLButtonElement) => candidate.textContent?.includes('Appel de groupe')) as HTMLButtonElement;
            button.click();
            await Promise.resolve();
            await Promise.resolve();

            expect(calls.start).toHaveBeenCalledWith('conv-1', 'VIDEO');
            expect(router.navigate).toHaveBeenCalledWith(['/call', 'call-1']);
        });

        it('template_shouldOfferToJoin_theCallGoingOn', () => {
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me'] })));
            calls.liveCall.mockReturnValue(of(live));
            create();

            expect(calls.liveCall).toHaveBeenCalledWith('conv-1');
            expect(fixture.nativeElement.querySelector('.call-live')?.textContent).toContain('Appel en cours');

            calls.events$.next({ type: 'ENDED', actorId: 'f1', call: { ...live, status: 'ENDED' } });
            fixture.detectChanges();
            expect(fixture.nativeElement.querySelector('.call-live')).toBeNull();
        });

        it('template_shouldOfferNoCall_toAGuest', () => {
            create();

            expect(fixture.nativeElement.textContent).not.toContain('Appel de groupe');
        });
    });

    it('openDiscussion_shouldOpenTheGroupInTheChat', () => {
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me'] })));
        create();

        (fixture.nativeElement.querySelector('.open-discussion') as HTMLButtonElement).click();

        expect(router.navigate).toHaveBeenCalledWith(['/chat', 'conv-1']);
    });

    it('openDiscussion_shouldDoNothing_beforeTheGroupIsLoaded', () => {
        chatService.getEventConversation.mockReturnValue(new Subject<Conversation>());
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me'] })));
        create();

        component.openDiscussion();

        expect(router.navigate).not.toHaveBeenCalled();
    });

    it('template_shouldStillOfferTheDiscussionOnceItIsOver', () => {
        vi.setSystemTime(at('2026-10-19T10:00:00'));
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me'] })));

        create();

        expect(fixture.nativeElement.querySelector('app-chat-bubble')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('.open-discussion')?.textContent).toContain('Voir la discussion');
    });

    it('people_shouldListFriendsFirst', () => {
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['u2', 'f1'] })));

        create();

        expect(component.people().map(person => person.id)).toEqual(['f1', 'u2']);
    });

    it('template_shouldBadgeASurprise_andOfferToJoinIt', () => {
        eventService.getEvent.mockReturnValue(of(event({ kind: 'SURPRISE', honoreeId: 'lea' })));

        create();

        expect(fixture.nativeElement.querySelector('.surprise-badge')?.textContent).toContain('🤫 Surprise');
        expect(fixture.nativeElement.querySelector('.action-bar .gradient-button')).not.toBeNull();
    });

    it('template_shouldNotOfferToJoinABirthday', () => {
        eventService.getEvent.mockReturnValue(of(event({ kind: 'BIRTHDAY', allDay: true })));

        create();

        expect(fixture.nativeElement.querySelector('.action-bar')).toBeNull();
        expect(fixture.nativeElement.querySelector('.surprise-badge')).toBeNull();
        expect(component.timeRange(component.event()!)).toBe('Toute la journée');
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

    describe('leaving', () => {
        const refusal = (code: string, status = 409) =>
            throwError(() => new HttpErrorResponse({ status, error: { code } }));
        const leaveButton = (): HTMLButtonElement | null => fixture.nativeElement.querySelector('.leave-button');
        /** Dialogs answer in turn, the last answer repeated. */
        const dialogAnswers = (...answers: unknown[]) => {
            let index = 0;
            dialog.open.mockImplementation(() => {
                const answer = answers[Math.min(index++, answers.length - 1)];
                return { afterClosed: () => of(answer) };
            });
        };
        const asOrganizer = (participantIds: string[]) => {
            eventService.getEvent.mockReturnValue(of(event({ organizerId: 'me' })));
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds })));
        };

        it('template_shouldOfferToLeave_toAParticipant', () => {
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['org', 'me'] })));
            create();

            expect(leaveButton()?.textContent).toContain("Quitter l'événement");
        });

        it('template_shouldOfferToLeave_toAnOrganizerNotRegistered', () => {
            asOrganizer(['f1']);
            create();

            expect(leaveButton()).not.toBeNull();
        });

        it('template_shouldNotOfferToLeave_toAGuest', () => {
            create();

            expect(leaveButton()).toBeNull();
        });

        it('leave_shouldLeaveDirectlyThenReloadTheParticipants_whenNotOrganizer', () => {
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['org', 'me'] })));
            create();
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['org'] })));

            leaveButton()!.click();

            expect(dialog.open).not.toHaveBeenCalled();
            expect(eventService.leave).toHaveBeenCalledWith('e1', {});
            expect(eventService.getParticipants).toHaveBeenCalledTimes(2);
            expect(component.joined()).toBe(false);
            expect(component.busy()).toBe(false);
        });

        it('leave_shouldDoNothing_whileBusy', () => {
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['org', 'me'] })));
            create();
            component.busy.set(true);

            component.leave();

            expect(eventService.leave).not.toHaveBeenCalled();
        });

        it('leave_shouldAskTheOrganizerForASuccessor_thenHandTheEventOver', () => {
            asOrganizer(['me', 'f1', 'u2']);
            dialogAnswers('u2');
            eventService.leave.mockReturnValue(of({ deleted: false, event: event({ organizerId: 'u2' }) }));
            create();

            component.leave();

            expect(dialog.open).toHaveBeenCalledWith(HandOverDialogComponent, expect.objectContaining({
                data: { people: [{ id: 'f1', name: 'Léo Martin' }, { id: 'u2', name: 'Inès Bernard' }] }
            }));
            expect(eventService.leave).toHaveBeenCalledWith('e1', { newOrganizerId: 'u2' });
            expect(component.event()?.organizerId).toBe('u2');
            expect(component.isOrganizer()).toBe(false);
            expect(eventService.getParticipants).toHaveBeenCalledTimes(2);
            expect(component.busy()).toBe(false);
        });

        it('leave_shouldStay_whenTheOrganizerCancelsTheHandOver', () => {
            asOrganizer(['me', 'f1']);
            dialogAnswers(undefined);
            create();

            component.leave();

            expect(dialog.open).toHaveBeenCalledWith(HandOverDialogComponent, expect.anything());
            expect(eventService.leave).not.toHaveBeenCalled();
        });

        it('leave_shouldConfirmTheDeletion_thenGoBack_whenTheOrganizerIsAlone', () => {
            asOrganizer(['me']);
            dialogAnswers(true);
            eventService.leave.mockReturnValue(of({ deleted: true, event: null }));
            create();

            component.leave();

            expect(dialog.open).toHaveBeenCalledWith(ConfirmDialogComponent, expect.objectContaining({
                data: expect.objectContaining({
                    title: "Supprimer l'événement ?",
                    confirmText: 'Supprimer et partir',
                    isDestructive: true
                })
            }));
            expect(eventService.leave).toHaveBeenCalledWith('e1', { deleteIfLast: true });
            expect(notifications.showInfo).toHaveBeenCalledWith('Événement supprimé');
            expect(navigation.back).toHaveBeenCalledWith('/calendar');
        });

        it('leave_shouldKeepTheEvent_whenTheDeletionIsNotConfirmed', () => {
            asOrganizer(['me']);
            dialogAnswers(false);
            create();

            component.leave();

            expect(dialog.open).toHaveBeenCalledWith(ConfirmDialogComponent, expect.anything());
            expect(eventService.leave).not.toHaveBeenCalled();
            expect(navigation.back).not.toHaveBeenCalled();
        });

        it('leave_shouldReloadAndAskForASuccessor_whenSomeoneJoinedMeanwhile', () => {
            asOrganizer(['me']);
            dialogAnswers(true, 'f1');
            eventService.leave
                .mockReturnValueOnce(refusal('EVT-BUS-020'))
                .mockReturnValue(of({ deleted: false, event: event({ organizerId: 'f1' }) }));
            create();
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me', 'f1'] })));

            component.leave();

            expect(dialog.open.mock.calls.map(call => call[0])).toEqual([ConfirmDialogComponent, HandOverDialogComponent]);
            expect(eventService.leave.mock.calls).toEqual([['e1', { deleteIfLast: true }], ['e1', { newOrganizerId: 'f1' }]]);
            expect(navigation.back).not.toHaveBeenCalled();
            expect(component.event()?.organizerId).toBe('f1');
        });

        it('leave_shouldAskAgainWithTheFreshList_whenTheSuccessorLeftMeanwhile', () => {
            asOrganizer(['me', 'f1', 'u2']);
            dialogAnswers('f1', 'u2');
            eventService.leave
                .mockReturnValueOnce(refusal('EVT-BUS-021', 400))
                .mockReturnValue(of({ deleted: false, event: event({ organizerId: 'u2' }) }));
            create();
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me', 'u2'] })));

            component.leave();

            expect(dialog.open).toHaveBeenCalledTimes(2);
            expect(dialog.open.mock.calls[1][1].data).toEqual({ people: [{ id: 'u2', name: 'Inès Bernard' }] });
            expect(eventService.leave).toHaveBeenLastCalledWith('e1', { newOrganizerId: 'u2' });
        });

        it('leave_shouldConfirmTheDeletion_whenTheServerSaysTheViewerIsTheLastMember', () => {
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['org', 'me'] })));
            dialogAnswers(true);
            eventService.leave
                .mockReturnValueOnce(refusal('EVT-BUS-022'))
                .mockReturnValue(of({ deleted: true, event: null }));
            create();

            component.leave();

            expect(dialog.open).toHaveBeenCalledWith(ConfirmDialogComponent, expect.anything());
            expect(eventService.leave.mock.calls).toEqual([['e1', {}], ['e1', { deleteIfLast: true }]]);
            expect(navigation.back).toHaveBeenCalledWith('/calendar');
        });

        it('askHowToLeave_shouldConfirmDeletion_whenEveryOtherParticipantIsDeleted', () => {
            asOrganizer(['me', 'gone']);
            create();

            component.leave();

            expect(dialog.open).toHaveBeenCalledTimes(1);
            expect(dialog.open).toHaveBeenCalledWith(ConfirmDialogComponent, expect.anything());
        });

        it('askSuccessor_shouldNotOfferADeletedParticipant', () => {
            asOrganizer(['me', 'f1', 'gone']);
            dialogAnswers(undefined);
            create();

            component.leave();

            expect(dialog.open).toHaveBeenCalledWith(HandOverDialogComponent, expect.objectContaining({
                data: { people: [{ id: 'f1', name: 'Léo Martin' }] }
            }));
        });

        it('leave_shouldSendDeleteIfLast_whenOnlyDeletedParticipantsRemain', () => {
            asOrganizer(['me', 'gone']);
            dialogAnswers(true);
            eventService.leave.mockReturnValue(of({ deleted: true, event: null }));
            create();

            component.leave();

            expect(eventService.leave).toHaveBeenCalledWith('e1', { deleteIfLast: true });
            expect(navigation.back).toHaveBeenCalledWith('/calendar');
        });

        it('askHowToLeave_shouldCheckTheParticipantsTheDirectoryCannotName_beforeChoosing', () => {
            // Deleted moments ago: the cache does not know yet, wely-users does.
            asOrganizer(['me', 'late']);
            deletedUsers.deletedAmong.mockReturnValue(of(new Set(['late'])));
            create();

            component.leave();

            expect(deletedUsers.deletedAmong).toHaveBeenCalledWith(['late']);
            expect(dialog.open).toHaveBeenCalledWith(ConfirmDialogComponent, expect.anything());
        });

        it('askHowToLeave_shouldNotOfferADeletedParticipant_thatAStaleDirectoryStillNames', () => {
            // The page was loaded before Inès deleted her account: its directory still names her.
            asOrganizer(['me', 'f1', 'u2']);
            deletedUsers.deletedIds.set(new Set(['gone', 'u2']));
            dialogAnswers(undefined);
            create();

            component.leave();

            expect(deletedUsers.deletedAmong).toHaveBeenCalledWith(['f1', 'u2']);
            expect(dialog.open).toHaveBeenCalledWith(HandOverDialogComponent, expect.objectContaining({
                data: { people: [{ id: 'f1', name: 'Léo Martin' }] }
            }));
        });

        it('askHowToLeave_shouldHoldTheButton_whileTheCheckIsPending', () => {
            asOrganizer(['me', 'f1']);
            const answer = new Subject<ReadonlySet<string>>();
            deletedUsers.deletedAmong.mockReturnValue(answer);
            dialogAnswers(undefined);
            create();

            component.leave();
            component.leave();

            expect(component.busy()).toBe(true);
            expect(deletedUsers.deletedAmong).toHaveBeenCalledTimes(1);
            expect(dialog.open).not.toHaveBeenCalled();
            answer.next(new Set());
            expect(component.busy()).toBe(false);
            expect(dialog.open).toHaveBeenCalledTimes(1);
        });

        it('onLeaveRefused_shouldNotOfferTheRefusedDeletedSuccessorAgain', () => {
            // Inès deletes her account while the organizer chooses; the event keeps her id, wely-events refuses her.
            asOrganizer(['me', 'f1', 'u2']);
            dialogAnswers('u2', 'f1');
            eventService.leave
                .mockImplementationOnce(() => {
                    deletedUsers.deletedIds.set(new Set(['gone', 'u2']));
                    return refusal('EVT-BUS-021', 400);
                })
                .mockReturnValue(of({ deleted: false, event: event({ organizerId: 'f1' }) }));
            create();

            component.leave();

            expect(dialog.open).toHaveBeenCalledTimes(2);
            expect(dialog.open.mock.calls[0][1].data).toEqual({
                people: [{ id: 'f1', name: 'Léo Martin' }, { id: 'u2', name: 'Inès Bernard' }]
            });
            expect(dialog.open.mock.calls[1][1].data).toEqual({ people: [{ id: 'f1', name: 'Léo Martin' }] });
            expect(eventService.leave.mock.calls).toEqual([['e1', { newOrganizerId: 'u2' }], ['e1', { newOrganizerId: 'f1' }]]);
            expect(component.event()?.organizerId).toBe('f1');
        });

        it('askHowToLeave_shouldStillOfferTheUnnamedParticipants_whenTheCheckFails', () => {
            asOrganizer(['me', 'late']);
            deletedUsers.deletedAmong.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
            create();

            component.leave();

            expect(dialog.open).toHaveBeenCalledWith(HandOverDialogComponent, expect.objectContaining({
                data: { people: [{ id: 'late', name: 'Quelqu’un' }] }
            }));
        });

        it('leave_shouldStayAndReleaseTheButton_whenItFailsOtherwise', () => {
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['org', 'me'] })));
            eventService.leave.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
            create();

            component.leave();

            expect(component.busy()).toBe(false);
            expect(dialog.open).not.toHaveBeenCalled();
            expect(eventService.getParticipants).toHaveBeenCalledTimes(1);
            expect(component.joined()).toBe(true);
        });
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

    it('template_shouldNotShowTheExpensesToAGuest', () => {
        create();

        expect(fixture.nativeElement.querySelector('app-event-expenses')).toBeNull();
    });

    it('expenseMembers_shouldListTheOrganizerAndEveryoneTakingPart', () => {
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me', 'u2'] })));
        create();

        expect(component.expenseMembers().map(member => member.id)).toEqual(['org', 'me', 'u2']);
        expect(component.expenseMembers()[1].name).toBe('Toi');
        expect(fixture.nativeElement.querySelector('app-event-expenses')).not.toBeNull();
    });

    describe('deleted participants', () => {
        it('people_shouldNameAConfirmedDeletedParticipantWithTheDeletedLabel', () => {
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me', 'gone'] })));
            create();

            const gone = component.people().find(person => person.id === 'gone');
            expect(gone).toMatchObject({ name: 'Utilisateur supprimé', deleted: true });
            expect(fixture.nativeElement.textContent).toContain('Utilisateur supprimé');
        });

        it('people_shouldKeepQuelquun_forAnUnresolvedLiveId', () => {
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me', 'stranger'] })));
            create();

            expect(component.people().find(person => person.id === 'stranger')).toMatchObject({ name: 'Quelqu’un', deleted: false });
        });

        it('people_shouldNotAskAboutDeletion_beforeTheDirectoryIsLoaded', () => {
            socialService.searchUsers.mockReturnValue(NEVER);
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me', 'gone'] })));
            create();

            expect(component.people().find(person => person.id === 'gone')?.deleted).toBe(false);
            expect(deletedUsers.isDeleted).not.toHaveBeenCalled();
        });

        it('people_shouldNotAskAboutDeletion_forSomeoneTheDirectoryNames', () => {
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me', 'u2'] })));
            create();

            expect(deletedUsers.isDeleted).not.toHaveBeenCalledWith('u2');
        });

        it('people_shouldGiveADeletedParticipantANeutralAvatarWithoutInitials', () => {
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me', 'gone'] })));
            create();

            const gone = component.people().find(person => person.id === 'gone')!;
            expect(gone.initials).toBe('');
            expect(gone.picture).toBeUndefined();
            const row = Array.from(fixture.nativeElement.querySelectorAll('.person-row') as NodeListOf<HTMLElement>)
                .find(candidate => candidate.textContent?.includes('Utilisateur supprimé'))!;
            expect(row.querySelector('.avatar mat-icon')?.textContent).toBe('person');
            // Nobody to befriend.
            expect(row.querySelector('.small-outline-button')).toBeNull();
        });

        it('threadPreview_shouldLeaveTheAuthorToTheBubble_whenTheSenderNameIsNull', () => {
            chatService.getEventConversation.mockReturnValue(of(group([chatMessage({ senderId: 'gone', senderName: null })])));
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me'] })));
            create();

            expect(component.threadPreview()[0].senderName).toBeUndefined();
            expect(fixture.nativeElement.querySelector('app-chat-bubble .author')?.textContent).toBe('Utilisateur supprimé');
        });

        it('expenseMembers_shouldCarryTheDeletedFlag', () => {
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me', 'gone'] })));
            create();

            expect(component.expenseMembers().find(member => member.id === 'gone')).toMatchObject({
                name: 'Utilisateur supprimé', initials: '', deleted: true
            });
            expect(component.expenseMembers().find(member => member.id === 'me')?.deleted).toBe(false);
        });

        it('strangers_shouldLeaveOutDeletedParticipants', () => {
            eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me', 'u2', 'gone'] })));
            create();

            expect(component.strangers().map(person => person.id)).toEqual(['u2']);
        });
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

    it('goBack_shouldReturnWhereThePageWasOpenedFrom_orToTheCalendar', () => {
        create();

        component.goBack();

        expect(navigation.back).toHaveBeenCalledWith('/calendar');
    });

    it('followThread_shouldReplaceAnUpdatedMessage_andIgnoreAnUpdateToOneNotShown', () => {
        eventService.getParticipants.mockReturnValue(of(participants({ participantIds: ['me'] })));
        create();

        chatService.messages$.next(chatMessage({ id: 'm1', content: '', kind: 'UPDATED',
            photo: { width: 0, height: 0, url: null, removed: true } }));
        chatService.messages$.next(chatMessage({ id: 'old', content: 'ancien', kind: 'UPDATED' }));

        expect(component.thread()).toHaveLength(1);
        expect(component.thread()[0].photo?.removed).toBe(true);
    });

    describe('cover', () => {
        const coverActions = () => fixture.nativeElement.querySelector('.cover-actions') as HTMLElement | null;
        const pick = (file: File) => ({ target: { files: [file], value: 'C:/cover.jpg' } }) as unknown as Event;

        it('template_shouldNotOfferCoverActionsToSomeoneElse', () => {
            eventService.getEvent.mockReturnValue(of(event({ image: 'https://media/cover.jpg' })));
            create();

            expect(coverActions()).toBeNull();
        });

        it('template_shouldOfferToAddACover_toTheOrganizerOfAnEventWithout', () => {
            eventService.getEvent.mockReturnValue(of(event({ organizerId: 'me', image: null })));
            create();

            expect(coverActions()?.textContent).toContain('Ajouter une couverture');
            expect(coverActions()?.querySelector('.remove-cover')).toBeNull();
        });

        it('template_shouldOfferToChangeOrRemoveTheCover_toTheOrganizer', () => {
            eventService.getEvent.mockReturnValue(of(event({ organizerId: 'me', image: 'https://media/cover.jpg' })));
            create();

            expect(coverActions()?.textContent).toContain('Changer la couverture');
            expect(coverActions()?.querySelector('.remove-cover')?.textContent).toContain('Retirer la couverture');
        });

        it('onCoverPicked_shouldOpenTheCropDialog_andShowTheNewCover', () => {
            eventService.getEvent.mockReturnValue(of(event({ organizerId: 'me', image: null })));
            dialog.open.mockReturnValue({ afterClosed: () => of(event({ organizerId: 'me', image: 'https://media/new.jpg' })) });
            create();
            const file = new File(['x'], 'cover.jpg', { type: 'image/jpeg' });

            component.onCoverPicked(pick(file));
            fixture.detectChanges();

            expect(dialog.open).toHaveBeenCalledWith(EventCoverDialogComponent, expect.objectContaining({ data: { eventId: 'e1', file } }));
            expect(component.event()?.image).toBe('https://media/new.jpg');
            expect(fixture.nativeElement.querySelector('.cover img')?.getAttribute('src')).toBe('https://media/new.jpg');
        });

        it('onCoverPicked_shouldKeepTheCover_whenTheDialogIsCancelled', () => {
            eventService.getEvent.mockReturnValue(of(event({ organizerId: 'me', image: 'https://media/cover.jpg' })));
            create();

            component.onCoverPicked(pick(new File(['x'], 'cover.jpg')));

            expect(component.event()?.image).toBe('https://media/cover.jpg');
        });

        it('removeCover_shouldTakeTheCoverOff', () => {
            eventService.getEvent.mockReturnValue(of(event({ organizerId: 'me', image: 'https://media/cover.jpg' })));
            create();

            component.removeCover();
            fixture.detectChanges();

            expect(eventService.removeCover).toHaveBeenCalledWith('e1');
            expect(component.event()?.image).toBeNull();
            expect(fixture.nativeElement.querySelector('.cover')?.classList).toContain('no-image');
        });

        it('removeCover_shouldExplainAFailure_andKeepTheCover', () => {
            eventService.getEvent.mockReturnValue(of(event({ organizerId: 'me', image: 'https://media/cover.jpg' })));
            eventService.removeCover.mockReturnValue(throwError(() =>
                new HttpErrorResponse({ status: 502, error: { code: 'EVT-TEC-003' } })));
            create();

            component.removeCover();

            expect(component.coverError()).toContain('indisponibles');
            expect(component.coverRemoving()).toBe(false);
            expect(component.event()?.image).toBe('https://media/cover.jpg');
        });
    });

    describe('add to calendar', () => {
        const el = (): HTMLElement => fixture.nativeElement;

        it('template_shouldOfferTheAgendaOnceTheDateIsFixed', () => {
            create();

            expect(el().querySelector('.info-card .add-to-calendar')?.textContent).toContain('Ajouter à mon calendrier');
        });

        it('template_shouldNotOfferTheAgendaWhileTheDateIsVotedOn', () => {
            eventService.getEvent.mockReturnValue(of(event({
                poll: { status: 'OPEN', fixedSlotId: null, slots: [] }
            })));
            create();

            expect(el().querySelector('.add-to-calendar')).toBeNull();
        });

        it('googleCalendarUrl_shouldFillGoogleWithTheEventAndLinkBackToThePage', () => {
            create();

            const url = new URL(component.googleCalendarUrl()!);
            expect(url.hostname).toBe('calendar.google.com');
            expect(url.searchParams.get('text')).toBe('Soirée jeux');
            expect(url.searchParams.get('location')).toBe('Le Transbordeur');
            expect(url.searchParams.get('details')).toBe(`Ramenez vos jeux\n\n${window.location.origin}/event/e1`);
        });

        it('addToCalendarApp_shouldOpenTheIcsWelyEventsServes', () => {
            create();
            const open = vi.spyOn(component, 'openCalendarFile').mockImplementation(() => undefined);
            const download = vi.spyOn(component, 'downloadIcs');

            component.addToCalendarApp();

            expect(eventService.calendarFileUrl).toHaveBeenCalledWith('e1');
            expect(open).toHaveBeenCalledWith('/api/v1/events-service/public/calendar/tok.ics');
            expect(download).not.toHaveBeenCalled();
        });

        it('addToCalendarApp_shouldSaveTheFileBuiltHere_withoutALink', () => {
            eventService.calendarFileUrl.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 502 })));
            create();
            const open = vi.spyOn(component, 'openCalendarFile').mockImplementation(() => undefined);
            const download = vi.spyOn(component, 'downloadIcs').mockImplementation(() => undefined);

            component.addToCalendarApp();

            expect(open).not.toHaveBeenCalled();
            expect(download).toHaveBeenCalled();
        });

        it('downloadIcs_shouldSaveTheEventAsAnIcsFile', async () => {
            create();
            let saved: Blob | undefined;
            const createUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
                saved = blob as Blob;
                return 'blob:ics';
            });
            const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
            const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

            component.downloadIcs();

            const clicked = click.mock.contexts[0] as HTMLAnchorElement | undefined;
            expect(clicked?.download).toBe('soiree-jeux.ics');
            expect(clicked?.href).toBe('blob:ics');
            expect(saved?.type).toBe('text/calendar;charset=utf-8');
            // jsdom's Blob has no text(): read through a FileReader.
            const ics = await new Promise<string>(resolve => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsText(saved!);
            });
            expect(ics).toContain('UID:e1@welylabs.app');
            expect(ics).toContain('SUMMARY:Soirée jeux');
            expect(ics).toContain(`DTSTART:${at('2026-10-18T19:30:00').toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`);
            expect(revoke).toHaveBeenCalledWith('blob:ics');
            createUrl.mockRestore();
            revoke.mockRestore();
            click.mockRestore();
        });
    });

    describe('date poll', () => {
        const openPoll = (yes: string[] = []): Poll => ({
            status: 'OPEN',
            fixedSlotId: null,
            slots: [
                { id: 's1', start: at('2026-10-20T19:00:00'), end: at('2026-10-20T22:00:00'), yes, maybe: [], no: [] },
                { id: 's2', start: at('2026-10-21T19:00:00'), end: at('2026-10-21T22:00:00'), yes: [], maybe: [], no: [] }
            ]
        });
        const el = (): HTMLElement => fixture.nativeElement;

        it('template_shouldShowThePollToAGuest_andSayTheDateIsNotFixed', () => {
            eventService.getEvent.mockReturnValue(of(event({ poll: openPoll() })));
            create();

            expect(component.phase()).toBe('guest');
            expect(el().querySelector('app-event-poll')).not.toBeNull();
            expect(el().querySelector('.hero-meta')?.textContent).toContain('Sondage en cours');
            expect(el().querySelector('.info-card')?.textContent).toContain('Sondage en cours');
            expect(component.countdown()).toBe('Date à fixer');
        });

        it('template_shouldShowThePollToAMember', () => {
            eventService.getEvent.mockReturnValue(of(event({ organizerId: 'me', poll: openPoll() })));
            create();

            expect(component.phase()).toBe('member');
            expect(el().querySelector('app-event-poll')).not.toBeNull();
        });

        it('phase_shouldNotBeLive_whileThePollIsOpen_evenOnTheProvisionalDay', () => {
            vi.setSystemTime(at('2026-10-18T20:00:00'));
            eventService.getEvent.mockReturnValue(of(event({ organizerId: 'me', poll: openPoll() })));
            create();

            expect(component.phase()).toBe('member');
        });

        it('template_shouldHideThePoll_whenThereIsNone', () => {
            create();

            expect(el().querySelector('app-event-poll')).toBeNull();
            expect(el().querySelector('.hero-meta')?.textContent).not.toContain('Sondage en cours');
            expect(pollStream.follow).not.toHaveBeenCalled();
        });

        it('stream_shouldApplyEachLivePoll_toTheEvent', () => {
            const live = new Subject<Poll>();
            pollStream.follow.mockReturnValue(live);
            eventService.getEvent.mockReturnValue(of(event({ poll: openPoll() })));
            create();
            fixture.detectChanges();

            expect(pollStream.follow).toHaveBeenCalledWith('e1');
            live.next(openPoll(['f1']));

            expect(component.event()?.poll?.slots[0].yes).toEqual(['f1']);
            expect(pollStream.follow).toHaveBeenCalledTimes(1);
        });

        it('stream_shouldReloadTheEvent_whenThePollArrivesClosed', () => {
            const live = new Subject<Poll>();
            pollStream.follow.mockReturnValue(live);
            eventService.getEvent.mockReturnValue(of(event({ poll: openPoll() })));
            create();
            fixture.detectChanges();
            eventService.getEvent.mockReturnValue(of(event({ poll: { ...openPoll(), status: 'CLOSED', fixedSlotId: 's1' } })));

            live.next({ ...openPoll(), status: 'CLOSED', fixedSlotId: 's1' });
            fixture.detectChanges();

            expect(eventService.getEvent).toHaveBeenCalledTimes(2);
            expect(eventService.getParticipants).toHaveBeenCalledTimes(2);
            expect(component.polling()).toBe(false);
            expect(el().querySelector('app-event-poll')).toBeNull();
        });

        it('stream_shouldKeepThePage_whenTheStreamFails', () => {
            pollStream.follow.mockReturnValue(throwError(() => new Error('404')));
            eventService.getEvent.mockReturnValue(of(event({ poll: openPoll() })));
            create();
            fixture.detectChanges();

            expect(component.event()?.poll?.status).toBe('OPEN');
            expect(component.notFound()).toBe(false);
        });

        it('applyPoll_shouldReplaceThePoll_whenItIsStillOpen', () => {
            eventService.getEvent.mockReturnValue(of(event({ poll: openPoll() })));
            create();

            component.applyPoll(openPoll(['me']));

            expect(component.event()?.poll?.slots[0].yes).toEqual(['me']);
            expect(eventService.getEvent).toHaveBeenCalledTimes(1);
        });

        it('onDateFixed_shouldReloadTheEventAndItsParticipants', () => {
            eventService.getEvent.mockReturnValue(of(event({ organizerId: 'me', poll: openPoll() })));
            create();
            eventService.getEvent.mockReturnValue(of(event({ organizerId: 'me', poll: null })));

            component.onDateFixed();
            fixture.detectChanges();

            expect(eventService.getEvent).toHaveBeenCalledTimes(2);
            expect(eventService.getParticipants).toHaveBeenCalledTimes(2);
            expect(el().querySelector('.hero-meta')?.textContent).not.toContain('Sondage en cours');
        });

        it('voterOf_shouldNameTheVoterFromTheDirectory', () => {
            create();

            expect(component.voterOf('f1').name).toBe('Léo Martin');
            expect(component.voterOf('me').name).toBe('Toi');
        });
    });
    describe('schedule conflicts', () => {
        it('should ask whether the event clashes with the viewer\'s agenda', () => {
            create();

            expect(schedule.getConflicts).toHaveBeenCalledWith('e1');
            expect(fixture.nativeElement.querySelector('app-event-conflicts')).not.toBeNull();
        });

        it('should not ask for a past event', () => {
            vi.setSystemTime(at('2026-10-20T10:00:00'));
            create();

            expect(fixture.nativeElement.querySelector('app-event-conflicts')).toBeNull();
            expect(schedule.getConflicts).not.toHaveBeenCalled();
        });

        it('should show the new dates once the organizer moved the event', () => {
            create();
            const moved = { ...component.event()!, startDate: at('2026-10-15T20:00:00'), endDate: at('2026-10-15T22:00:00') };

            component.onRescheduled(moved);

            expect(component.event()).toBe(moved);
        });
    });
});
