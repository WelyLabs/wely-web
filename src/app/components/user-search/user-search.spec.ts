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

    it('should load users on init when route data is emitted', () => {
        routeDataSubject.next({ mode: 'search' });
        expect(socialServiceMock.searchUsers).toHaveBeenCalled();
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

    it('should navigate to chat when onChat is called', () => {
        const user = { userId: 123, userName: 'Bob' } as any;
        component.onChat(user);
        expect(chatServiceMock.getConversation).toHaveBeenCalledWith('123');
        expect(routerMock.navigate).toHaveBeenCalledWith(['/chat', 'conv1']);
    });

    it('should handle tab changes', () => {
        component.isFriendsMode = true;
        component.onTabChange(1);
        expect(component.activeTabIndex).toBe(1);
        expect(socialServiceMock.searchUsers).toHaveBeenCalledWith('PENDING_OUTGOING');
    });

    it('should open dialog and reload on confirm remove friend', () => {
        const user = { userId: 1, userName: 'Alice' } as any;
        component.onRemoveFriend(user);
        expect(dialogMock.open).toHaveBeenCalled();
        expect(socialServiceMock.removeFriend).toHaveBeenCalledWith(1);
    });
});
