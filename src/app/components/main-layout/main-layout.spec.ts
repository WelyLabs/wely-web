import 'zone.js';
import 'zone.js/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MainLayoutComponent } from './main-layout';
import { Router } from '@angular/router';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { KeycloakService } from 'keycloak-angular';
import { UserService } from '../../services/user.service';
import { User } from '../../models/user.model';
import { ChatService } from '../../services/chat.service';
import { NotificationService } from '../../services/notification.service';
import { of, BehaviorSubject, Subject } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatSidenavModule } from '@angular/material/sidenav';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute } from '@angular/router';

describe('MainLayoutComponent', () => {
    let component: MainLayoutComponent;
    let fixture: ComponentFixture<MainLayoutComponent>;
    let breakpointObserverMock: Partial<BreakpointObserver>;
    let keycloakMock: Partial<KeycloakService>;
    let userServiceMock: Partial<UserService>;
    let chatServiceMock: Partial<ChatService>;
    let notificationServiceMock: Partial<NotificationService>;
    let routerMock: any; // Router 'url' is read-only, we must use 'any' to override it in tests
    let userSubject: BehaviorSubject<User | null>;
    let chatMessagesSubject: Subject<any>;
    let breakpointSubject: Subject<any>;
    let routerEventsSubject: Subject<any>;

    beforeEach(async () => {
        TestBed.resetTestingModule();
        userSubject = new BehaviorSubject<User | null>({
            id: 'me',
            userName: 'Me',
            hashtag: '1234',
            email: 'me@example.com',
            firstName: 'Me',
            lastName: 'Test',
            jobTitle: '',
            department: '',
            location: '',
            bio: '',
            skills: [],
            joinedDate: '',
            projects: [],
            stats: { projectsCompleted: 0, hoursLogged: 0, efficiency: 0 }
        });
        chatMessagesSubject = new Subject();
        breakpointSubject = new Subject();
        routerEventsSubject = new Subject();

        breakpointObserverMock = {
            observe: vi.fn().mockReturnValue(breakpointSubject.asObservable())
        };
        keycloakMock = {
            logout: vi.fn()
        };
        userServiceMock = {
            currentUser$: userSubject.asObservable()
        };
        chatServiceMock = {
            initializeStream: vi.fn(),
            messages$: chatMessagesSubject.asObservable()
        };
        notificationServiceMock = {
            showChatNotification: vi.fn()
        };
        routerMock = {
            url: '/calendar',
            events: routerEventsSubject.asObservable(),
            navigate: vi.fn(),
            createUrlTree: vi.fn().mockReturnValue({}),
            serializeUrl: vi.fn().mockReturnValue('')
        };

        await TestBed.configureTestingModule({
            imports: [MainLayoutComponent, NoopAnimationsModule, MatSidenavModule, RouterTestingModule],
            providers: [
                { provide: ActivatedRoute, useValue: { params: of({}) } }
            ]
        }).overrideComponent(MainLayoutComponent, {
            set: {
                providers: [
                    { provide: BreakpointObserver, useValue: breakpointObserverMock },
                    { provide: KeycloakService, useValue: keycloakMock },
                    { provide: UserService, useValue: userServiceMock },
                    { provide: ChatService, useValue: chatServiceMock },
                    { provide: NotificationService, useValue: notificationServiceMock },
                    { provide: Router, useValue: routerMock }
                ]
            }
        }).compileComponents();

        fixture = TestBed.createComponent(MainLayoutComponent);
        component = fixture.componentInstance;
    });

    it('should create', () => {
        fixture.detectChanges();
        expect(component).toBeTruthy();
    });

    it('should initialize services and subscriptions on init', () => {
        fixture.detectChanges();
        expect(chatServiceMock.initializeStream).toHaveBeenCalled();
        expect(component.userProfile?.userName).toBe('Me');
    });

    it('should show notification for incoming messages when not in that chat', () => {
        fixture.detectChanges();
        const incomingMsg = {
            senderId: 'friend',
            conversationId: 'conv1',
            content: 'hello'
        };
        chatMessagesSubject.next(incomingMsg);
        expect(notificationServiceMock.showChatNotification).toHaveBeenCalledWith(incomingMsg);
    });

    it('should NOT show notification when viewing the same conversation', () => {
        routerMock.url = '/chat/conv1';
        fixture.detectChanges();
        const incomingMsg = {
            senderId: 'friend',
            conversationId: 'conv1',
            content: 'hello'
        };
        chatMessagesSubject.next(incomingMsg);
        expect(notificationServiceMock.showChatNotification).not.toHaveBeenCalled();
    });

    it('should toggle sidenav', () => {
        fixture.detectChanges();
        const toggleSpy = vi.spyOn(component.sidenav, 'toggle');
        component.toggleSidenav();
        expect(toggleSpy).toHaveBeenCalled();
    });

    it('should handle mobile breakpoint changes', () => {
        fixture.detectChanges();
        const closeSpy = vi.spyOn(component.sidenav, 'close');
        breakpointSubject.next({ matches: true }); // Mobile detected
        expect(component.isMobile).toBe(true);
        expect(closeSpy).toHaveBeenCalled();
    });

    it('should logout', async () => {
        fixture.detectChanges();
        await component.logout();
        expect(keycloakMock.logout).toHaveBeenCalled();
    });
});
