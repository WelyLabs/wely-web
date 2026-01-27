import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserSearchComponent } from './user-search';
import { UserService } from '../../services/user.service';
import { SocialService } from '../../services/social.service';
import { ChatService } from '../../services/chat.service';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of, Subject } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BreakpointObserver } from '@angular/cdk/layout';

describe('UserSearchComponent', () => {
    let component: UserSearchComponent;
    let fixture: ComponentFixture<UserSearchComponent>;
    let socialServiceMock: any;
    let chatServiceMock: any;
    let userServiceMock: any;
    let routerMock: any;
    let dialogMock: any;
    let breakpointObserverMock: any;
    let routeDataSubject: Subject<any>;

    beforeEach(async () => {
        routeDataSubject = new Subject();
        socialServiceMock = {
            searchUsers: vi.fn().mockReturnValue(of([])),
            acceptFriend: vi.fn().mockReturnValue(of({})),
            rejectFriend: vi.fn().mockReturnValue(of({})),
            removeFriend: vi.fn().mockReturnValue(of({}))
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
                close: () => { }
            }))
        };
        breakpointObserverMock = {
            observe: vi.fn().mockReturnValue(of({ matches: false }))
        };

        await TestBed.configureTestingModule({
            imports: [UserSearchComponent, NoopAnimationsModule],
            providers: [
                {
                    provide: ActivatedRoute,
                    useValue: { data: routeDataSubject.asObservable() }
                }
            ]
        }).overrideComponent(UserSearchComponent, {
            set: {
                providers: [
                    { provide: SocialService, useValue: socialServiceMock },
                    { provide: ChatService, useValue: chatServiceMock },
                    { provide: UserService, useValue: userServiceMock },
                    { provide: Router, useValue: routerMock },
                    { provide: MatDialog, useValue: dialogMock },
                    { provide: BreakpointObserver, useValue: breakpointObserverMock }
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

    it('should load users on init and search mode', () => {
        routeDataSubject.next({ mode: 'search' });
        expect(socialServiceMock.searchUsers).toHaveBeenCalledWith(undefined);
        socialServiceMock.searchUsers.mockReturnValue(of([{ userId: 1, userName: 'Alice' }]));
        component.loadUsers();
        expect(component.users.length).toBe(1);
        expect(component.users[0].relationStatus).toBeUndefined();
    });

    it('should search users and filter locally', () => {
        component.users = [
            { userId: 1, userName: 'Alice' } as any,
            { userId: 2, userName: 'Bob' } as any
        ];
        component.searchQuery = 'ali';
        component.onSearchChange();
        expect(component.filteredUsers.length).toBe(1);
        expect(component.filteredUsers[0].userName).toBe('Alice');
    });

    it('should search users and reset filter when query is empty', () => {
        component.users = [{ userId: 1, userName: 'Alice' } as any];
        component.searchQuery = '';
        component.onSearchChange();
        expect(component.filteredUsers).toEqual(component.users);
    });

    it('should navigate to chat when onChat is called', () => {
        const user = { userId: 123, userName: 'Bob' } as any;
        component.onChat(user);
        expect(chatServiceMock.getConversation).toHaveBeenCalledWith('123');
        expect(routerMock.navigate).toHaveBeenCalledWith(['/chat', 'conv1']);
    });

    it('should handle tab changes and inferred status for PENDING_OUTGOING', () => {
        component.isFriendsMode = true;
        component.onTabChange(1);
        expect(component.activeTabIndex).toBe(1);
        expect(socialServiceMock.searchUsers).toHaveBeenCalledWith('PENDING_OUTGOING');
        socialServiceMock.searchUsers.mockReturnValue(of([{ userId: 1, userName: 'Alice' }]));
        component.loadUsers();
        expect(component.users[0].relationStatus).toBe('PENDING_OUTGOING');
    });

    it('should handle tab changes and inferred status for PENDING_INCOMING', () => {
        component.isFriendsMode = true;
        component.onTabChange(2);
        expect(component.activeTabIndex).toBe(2);
        expect(socialServiceMock.searchUsers).toHaveBeenCalledWith('PENDING_INCOMING');
        socialServiceMock.searchUsers.mockReturnValue(of([{ userId: 1, userName: 'Alice' }]));
        component.loadUsers();
        expect(component.users[0].relationStatus).toBe('PENDING_INCOMING');
    });

    it('should NOT remove friend if dialog is cancelled', () => {
        dialogMock.open.mockReturnValue({ afterClosed: () => of(false) });
        const user = { userId: 1, userName: 'Alice' } as any;
        component.onRemoveFriend(user);
        expect(socialServiceMock.removeFriend).not.toHaveBeenCalled();
    });

    it('should open dialog and reload on confirm remove friend', () => {
        const user = { userId: 1, userName: 'Alice' } as any;
        component.onRemoveFriend(user);
        expect(dialogMock.open).toHaveBeenCalled();
        expect(socialServiceMock.removeFriend).toHaveBeenCalledWith(1);
    });

    it('should handle mobile breakpoint', () => {
        breakpointObserverMock.observe.mockReturnValue(of({ matches: true }));
        component.ngOnInit();
        expect(component.isMobile).toBe(true);
    });

    it('should navigate through tabs using nextTab and prevTab', () => {
        component.activeTabIndex = 0;
        component.nextTab();
        expect(component.activeTabIndex).toBe(1);
        component.nextTab();
        expect(component.activeTabIndex).toBe(2);
        component.nextTab(); // Should stay at 2
        expect(component.activeTabIndex).toBe(2);

        component.prevTab();
        expect(component.activeTabIndex).toBe(1);
        component.prevTab();
        expect(component.activeTabIndex).toBe(0);
        component.prevTab(); // Should stay at 0
        expect(component.activeTabIndex).toBe(0);
    });

    it('should open add friend dialog and reload if result is true', () => {
        const spy = vi.spyOn(component, 'loadUsers');
        component.openAddFriendDialog();
        expect(dialogMock.open).toHaveBeenCalled();
        expect(spy).toHaveBeenCalled();
    });

    it('should handle error when loading users', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        socialServiceMock.searchUsers.mockReturnValue(new Subject().asObservable()); // Stuck loading
        component.loadUsers();
        expect(component.isLoading).toBe(true);

        const errorSubject = new Subject<any>();
        socialServiceMock.searchUsers.mockReturnValue(errorSubject.asObservable());
        component.loadUsers();
        errorSubject.error('API Error');
        expect(component.error).toBe('Impossible de charger les utilisateurs');
        expect(component.isLoading).toBe(false);
        expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log on onAddFriend', () => {
        const consoleSpy = vi.spyOn(console, 'log');
        component.onAddFriend({ userId: 1 } as any);
        expect(consoleSpy).toHaveBeenCalledWith('Add friend:', expect.anything());
    });

    it('should accept friend and reload', () => {
        const spy = vi.spyOn(component, 'loadUsers');
        component.onAcceptFriend({ userId: 1 } as any);
        expect(socialServiceMock.acceptFriend).toHaveBeenCalledWith(1);
        expect(spy).toHaveBeenCalled();
    });

    it('should handle error when accepting friend', () => {
        socialServiceMock.acceptFriend.mockReturnValue(new Subject().asObservable());
        const errorSubject = new Subject();
        socialServiceMock.acceptFriend.mockReturnValue(errorSubject.asObservable());
        component.onAcceptFriend({ userId: 1 } as any);
        errorSubject.error('err');
        expect(component.error).toBe('Impossible d\'accepter la demande');
    });

    it('should decline friend and reload', () => {
        const spy = vi.spyOn(component, 'loadUsers');
        component.onDeclineFriend({ userId: 1 } as any);
        expect(socialServiceMock.rejectFriend).toHaveBeenCalledWith(1);
        expect(spy).toHaveBeenCalled();
    });

    it('should handle error when declining friend', () => {
        const errorSubject = new Subject();
        socialServiceMock.rejectFriend.mockReturnValue(errorSubject.asObservable());
        component.onDeclineFriend({ userId: 1 } as any);
        errorSubject.error('err');
        expect(component.error).toBe('Impossible de refuser la demande');
    });

    it('should handle error when removing friend', () => {
        dialogMock.open.mockReturnValue({ afterClosed: () => of(true) });
        const errorSubject = new Subject();
        socialServiceMock.removeFriend.mockReturnValue(errorSubject.asObservable());
        component.onRemoveFriend({ userId: 1 } as any);
        errorSubject.error('err');
        expect(component.error).toBe('Impossible de supprimer l\'ami');
    });

    it('should handle error when opening chat', () => {
        const errorSubject = new Subject();
        chatServiceMock.getConversation.mockReturnValue(errorSubject.asObservable());
        component.onChat({ userId: 1 } as any);
        errorSubject.error('err');
        expect(component.error).toBe('Impossible d\'ouvrir la discussion');
    });
});
