import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserSearchComponent } from './user-search';
import { CelebrationService } from '../../services/celebration.service';
import { UserService } from '../../services/user.service';
import { SocialService } from '../../services/social.service';
import { ChatService } from '../../services/chat.service';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of, Subject } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { EventService } from '../../services/event.service';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BreakpointObserver } from '@angular/cdk/layout';

// The RSocket modules are replaced by the shared stub in src/testing. The factory re-exports
// the module rather than redefining an object, so the service and the test work on the same
// state — a Vite alias created two separate module instances instead.
vi.mock('rsocket-core', () => import('../../../testing/rsocket-core.stub'));
vi.mock('rsocket-websocket-client', () => import('../../../testing/rsocket-websocket-client.stub'));

describe('UserSearchComponent', () => {
    let component: UserSearchComponent;
    let fixture: ComponentFixture<UserSearchComponent>;
    let socialServiceMock: any;
    let chatServiceMock: any;
    let userServiceMock: any;
    let routerMock: any;
    let dialogMock: any;
    let breakpointObserverMock: any;
    let eventServiceMock: { getEvent: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
        socialServiceMock = {
            searchUsers: vi.fn().mockReturnValue(of([])),
            sendFriendRequest: vi.fn().mockReturnValue(of({})),
            acceptFriend: vi.fn().mockReturnValue(of({})),
            rejectFriend: vi.fn().mockReturnValue(of({})),
            removeFriend: vi.fn().mockReturnValue(of({})),
            listFriendships: vi.fn().mockReturnValue(of([])),
            requestCloseness: vi.fn().mockReturnValue(of({})),
            acceptCloseness: vi.fn().mockReturnValue(of({})),
            declineCloseness: vi.fn().mockReturnValue(of({}))
        };
        chatServiceMock = {
            getConversation: vi.fn().mockReturnValue(of({ id: 'conv1' }))
        };
        userServiceMock = {};
        routerMock = {
            navigate: vi.fn()
        };
        dialogMock = {
            open: vi.fn().mockImplementation(() => ({
                afterClosed: () => of(true),
                close: () => undefined
            }))
        };
        eventServiceMock = {
            getEvent: vi.fn().mockImplementation((id: string) => of({ id, title: `Event ${id}` }))
        };
        breakpointObserverMock = {
            observe: vi.fn().mockReturnValue(of({ matches: false }))
        };

        await TestBed.configureTestingModule({
            imports: [UserSearchComponent, NoopAnimationsModule]
        }).overrideComponent(UserSearchComponent, {
            set: {
                providers: [
                    { provide: SocialService, useValue: socialServiceMock },
                    { provide: ChatService, useValue: chatServiceMock },
                    { provide: UserService, useValue: userServiceMock },
                    { provide: Router, useValue: routerMock },
                    { provide: MatDialog, useValue: dialogMock },
                    { provide: BreakpointObserver, useValue: breakpointObserverMock },
                    { provide: EventService, useValue: eventServiceMock }
                ]
            }
        }).compileComponents();

        fixture = TestBed.createComponent(UserSearchComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('ngOnInit_shouldOpenOnTheFriendsTab', () => {
        expect(component.activeTabIndex()).toBe(0);
        expect(socialServiceMock.listFriendships).toHaveBeenCalled();
        expect(socialServiceMock.searchUsers).not.toHaveBeenCalled();
    });

    it('should filter locally as the query changes', () => {
        // filteredUsers is a computed, so setting the query is enough — there is no longer an
        // onSearchChange for the template to remember to call.
        socialServiceMock.listFriendships.mockReturnValue(of([
            { userId: 'user-1', userName: 'Alice' },
            { userId: 'user-2', userName: 'Bob' }
        ]));
        component.loadUsers();

        component.searchQuery.set('ali');

        expect(component.filteredUsers().length).toBe(1);
        expect(component.filteredUsers()[0].userName).toBe('Alice');
    });

    it('should ignore case and surrounding spaces in the query', () => {
        socialServiceMock.listFriendships.mockReturnValue(of([{ userId: 'user-1', userName: 'Alice' }]));
        component.loadUsers();

        component.searchQuery.set('  ALI  ');

        expect(component.filteredUsers().length).toBe(1);
    });

    it('should show everyone again when the query is cleared', () => {
        socialServiceMock.listFriendships.mockReturnValue(of([
            { userId: 'user-1', userName: 'Alice' },
            { userId: 'user-2', userName: 'Bob' }
        ]));
        component.loadUsers();
        component.searchQuery.set('ali');
        expect(component.filteredUsers().length).toBe(1);

        component.searchQuery.set('');

        expect(component.filteredUsers().length).toBe(2);
    });

    it('should keep the query when the list is reloaded', () => {
        // The old code reset filteredUsers to the full list on every load, so a search was
        // silently undone whenever a tab change or a friend action refreshed the results.
        socialServiceMock.listFriendships.mockReturnValue(of([
            { userId: 'user-1', userName: 'Alice' },
            { userId: 'user-2', userName: 'Bob' }
        ]));
        component.searchQuery.set('ali');

        component.loadUsers();

        expect(component.filteredUsers().length).toBe(1);
    });

    it('should navigate to chat when onChat is called', () => {
        const user = { userId: 'user-123', userName: 'Bob' } as any;
        component.onChat(user);
        expect(chatServiceMock.getConversation).toHaveBeenCalledWith('user-123');
        expect(routerMock.navigate).toHaveBeenCalledWith(['/chat', 'conv1']);
    });

    it('should handle tab changes and inferred status for PENDING_OUTGOING', () => {
        component.onTabChange(1);
        expect(component.activeTabIndex()).toBe(1);
        expect(socialServiceMock.searchUsers).toHaveBeenCalledWith('PENDING_OUTGOING');
        socialServiceMock.searchUsers.mockReturnValue(of([{ userId: 'user-1', userName: 'Alice' }]));
        component.loadUsers();
        expect(component.filteredUsers()[0].relationStatus).toBe('PENDING_OUTGOING');
    });

    it('should handle tab changes and inferred status for PENDING_INCOMING', () => {
        component.onTabChange(2);
        expect(component.activeTabIndex()).toBe(2);
        expect(socialServiceMock.searchUsers).toHaveBeenCalledWith('PENDING_INCOMING');
        socialServiceMock.searchUsers.mockReturnValue(of([{ userId: 'user-1', userName: 'Alice' }]));
        component.loadUsers();
        expect(component.filteredUsers()[0].relationStatus).toBe('PENDING_INCOMING');
    });

    it('metAt_shouldNameTheEventARequestWasSentFrom', () => {
        socialServiceMock.searchUsers.mockReturnValue(of([
            { userId: 'user-1', userName: 'Alice', viaEventId: 'e1' },
            { userId: 'user-2', userName: 'Bob', viaEventId: 'e1' },
            { userId: 'user-3', userName: 'Carol' }
        ]));

        component.onTabChange(2);

        expect(eventServiceMock.getEvent).toHaveBeenCalledTimes(1);
        expect(eventServiceMock.getEvent).toHaveBeenCalledWith('e1');
        const [alice, , carol] = component.filteredUsers();
        expect(component.metAt(alice)).toBe('Event e1');
        expect(component.metAt(carol)).toBeNull();
    });

    it('metAt_shouldStayEmptyWhenTheEventCannotBeSeen', () => {
        eventServiceMock.getEvent.mockReturnValue(throwError(() => new Error('404')));
        socialServiceMock.searchUsers.mockReturnValue(of([{ userId: 'user-1', userName: 'Alice', viaEventId: 'gone' }]));

        component.onTabChange(2);

        expect(component.metAt(component.filteredUsers()[0])).toBeNull();
    });

    it('should NOT remove friend if dialog is cancelled', () => {
        dialogMock.open.mockReturnValue({ afterClosed: () => of(false) });
        const user = { userId: 'user-1', userName: 'Alice' } as any;
        component.onRemoveFriend(user);
        expect(socialServiceMock.removeFriend).not.toHaveBeenCalled();
    });

    it('should open dialog and reload on confirm remove friend', () => {
        const user = { userId: 'user-1', userName: 'Alice' } as any;
        component.onRemoveFriend(user);
        expect(dialogMock.open).toHaveBeenCalled();
        expect(socialServiceMock.removeFriend).toHaveBeenCalledWith('user-1');
    });

    it('should handle mobile breakpoint', () => {
        // isMobile reads the observer through toSignal, evaluated when the component is built,
        // so the mock has to answer before createComponent rather than before ngOnInit.
        breakpointObserverMock.observe.mockReturnValue(of({ matches: true }));
        const mobileFixture = TestBed.createComponent(UserSearchComponent);

        expect(mobileFixture.componentInstance.isMobile()).toBe(true);
    });

    it('should navigate through tabs using nextTab and prevTab', () => {
        component.activeTabIndex.set(0);
        component.nextTab();
        expect(component.activeTabIndex()).toBe(1);
        component.nextTab();
        expect(component.activeTabIndex()).toBe(2);
        component.nextTab(); // Should stay at 2
        expect(component.activeTabIndex()).toBe(2);

        component.prevTab();
        expect(component.activeTabIndex()).toBe(1);
        component.prevTab();
        expect(component.activeTabIndex()).toBe(0);
        component.prevTab(); // Should stay at 0
        expect(component.activeTabIndex()).toBe(0);
    });

    it('should open add friend dialog and reload if result is true', () => {
        const spy = vi.spyOn(component, 'loadUsers');
        component.openAddFriendDialog();
        expect(dialogMock.open).toHaveBeenCalled();
        expect(spy).toHaveBeenCalled();
    });

    it('should handle error when loading users', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        component.activeTabIndex.set(1);
        socialServiceMock.searchUsers.mockReturnValue(new Subject().asObservable()); // Stuck loading
        component.loadUsers();
        expect(component.isLoading()).toBe(true);

        const errorSubject = new Subject<any>();
        socialServiceMock.searchUsers.mockReturnValue(errorSubject.asObservable());
        component.loadUsers();
        errorSubject.error('API Error');
        expect(component.error()).toBe('Impossible de charger les utilisateurs');
        expect(component.isLoading()).toBe(false);
        expect(consoleSpy).toHaveBeenCalled();
    });

    it('should accept friend and reload', () => {
        const spy = vi.spyOn(component, 'loadUsers');
        component.onAcceptFriend({ userId: 'user-1' } as any);
        expect(socialServiceMock.acceptFriend).toHaveBeenCalledWith('user-1');
        expect(spy).toHaveBeenCalled();
    });

    it('should handle error when accepting friend', () => {
        socialServiceMock.acceptFriend.mockReturnValue(new Subject().asObservable());
        const errorSubject = new Subject();
        socialServiceMock.acceptFriend.mockReturnValue(errorSubject.asObservable());
        component.onAcceptFriend({ userId: 'user-1' } as any);
        errorSubject.error('err');
        expect(component.error()).toBe('Impossible d\'accepter la demande');
    });

    it('should decline friend and reload', () => {
        const spy = vi.spyOn(component, 'loadUsers');
        component.onDeclineFriend({ userId: 'user-1' } as any);
        expect(socialServiceMock.rejectFriend).toHaveBeenCalledWith('user-1');
        expect(spy).toHaveBeenCalled();
    });

    it('should handle error when declining friend', () => {
        const errorSubject = new Subject();
        socialServiceMock.rejectFriend.mockReturnValue(errorSubject.asObservable());
        component.onDeclineFriend({ userId: 'user-1' } as any);
        errorSubject.error('err');
        expect(component.error()).toBe('Impossible de refuser la demande');
    });

    it('should handle error when removing friend', () => {
        dialogMock.open.mockReturnValue({ afterClosed: () => of(true) });
        const errorSubject = new Subject();
        socialServiceMock.removeFriend.mockReturnValue(errorSubject.asObservable());
        component.onRemoveFriend({ userId: 'user-1' } as any);
        errorSubject.error('err');
        expect(component.error()).toBe('Impossible de supprimer l\'ami');
    });

    it('should handle error when opening chat', () => {
        const errorSubject = new Subject();
        chatServiceMock.getConversation.mockReturnValue(errorSubject.asObservable());
        component.onChat({ userId: 'user-1' } as any);
        errorSubject.error('err');
        expect(component.error()).toBe('Impossible d\'ouvrir la discussion');
    });

    describe('friends tab', () => {
        const lea = { userId: 'lea', userName: 'lea', hashtag: 6000, closeness: 'CLOSE', proposal: 'INTIMATE', proposedByFriend: true };
        const friendCard = { userId: 'lea', userName: 'lea', relationStatus: 'FRIENDS' } as any;

        beforeEach(() => {
            socialServiceMock.listFriendships.mockReturnValue(of([lea]));
                component.onTabChange(0);
        });

        it('loadUsers_shouldReadTheFriendshipsOnTheFriendsTab', () => {
            expect(socialServiceMock.listFriendships).toHaveBeenCalled();
            expect(socialServiceMock.searchUsers).not.toHaveBeenCalledWith('FRIENDS');
            expect(component.filteredUsers()).toEqual([{ userId: 'lea', userName: 'lea', profilePicUrl: undefined, relationStatus: 'FRIENDS' }]);
        });

        it('friendshipOf_shouldGiveEachCardItsFriendship', () => {
            expect(component.friendshipOf(friendCard)).toEqual(lea);
            expect(component.friendshipOf({ ...friendCard, userId: 'someone' })).toBeNull();
        });

        it('loadUsers_shouldForgetTheFriendshipsOnAnotherTab', () => {
            component.onTabChange(1);

            expect(component.friendshipOf(friendCard)).toBeNull();
        });

        it('loadUsers_shouldReportAFailureToLoadFriendships', () => {
            socialServiceMock.listFriendships.mockReturnValue(throwError(() => new Error('down')));

            component.loadUsers();

            expect(component.error()).toBe('Impossible de charger vos amis');
            expect(component.isLoading()).toBe(false);
        });

        it('onClosenessChange_shouldRequestTheLevelThenReload', () => {
            socialServiceMock.listFriendships.mockClear();

            component.onClosenessChange({ user: friendCard, closeness: 'INTIMATE' });

            expect(socialServiceMock.requestCloseness).toHaveBeenCalledWith('lea', 'INTIMATE');
            expect(socialServiceMock.listFriendships).toHaveBeenCalled();
        });

        it('onClosenessAnswer_shouldAcceptOrDecline', () => {
            component.onClosenessAnswer({ user: friendCard, accept: true });
            component.onClosenessAnswer({ user: friendCard, accept: false });

            expect(socialServiceMock.acceptCloseness).toHaveBeenCalledWith('lea');
            expect(socialServiceMock.declineCloseness).toHaveBeenCalledWith('lea');
        });

        it('onClosenessAnswer_shouldCelebrateTheNewLevel_whenAccepted', () => {
            socialServiceMock.acceptCloseness.mockReturnValue(of({ friendId: 'lea', closeness: 'CLOSE', proposal: null, proposedByFriend: false }));

            component.onClosenessAnswer({ user: friendCard, accept: true });

            expect(TestBed.inject(CelebrationService).closeness()).toMatchObject({ name: friendCard.userName, closeness: 'CLOSE' });
        });

        it('onClosenessChange_shouldExplainAConcurrentChange', () => {
            socialServiceMock.requestCloseness.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));

            component.onClosenessChange({ user: friendCard, closeness: 'INTIMATE' });

            expect(component.error()).toContain('au même moment');
        });

        it('onClosenessAnswer_shouldReportAnyOtherFailure', () => {
            socialServiceMock.acceptCloseness.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

            component.onClosenessAnswer({ user: friendCard, accept: true });

            expect(component.error()).toBe('Impossible de répondre à la proposition');
        });
    });
});
