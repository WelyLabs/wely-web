import 'zone.js';
import 'zone.js/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MainLayoutComponent } from './main-layout';
import { Router } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { KeycloakService } from 'keycloak-angular';
import { UserService } from '../../services/user.service';
import { User } from '../../models/user.model';
import { ChatService } from '../../services/chat.service';
import { NotificationService } from '../../services/notification.service';
import { LoggerService } from '../../core/logging/logger.service';
import { of, BehaviorSubject, Subject } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatSidenavModule } from '@angular/material/sidenav';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute, NavigationEnd } from '@angular/router';

// The RSocket modules are replaced by the shared stub in src/testing. The factory re-exports
// the module rather than redefining an object, so the service and the test work on the same
// state — a Vite alias created two separate module instances instead.
vi.mock('rsocket-core', () => import('../../../testing/rsocket-core.stub'));
vi.mock('rsocket-websocket-client', () => import('../../../testing/rsocket-websocket-client.stub'));

describe('MainLayoutComponent', () => {
    let component: MainLayoutComponent;
    let fixture: ComponentFixture<MainLayoutComponent>;
    let breakpointObserverMock: Partial<BreakpointObserver>;
    let keycloakMock: Partial<KeycloakService>;
    let userServiceMock: Partial<UserService>;
    let chatServiceMock: Partial<ChatService>;
    let notificationServiceMock: Partial<NotificationService>;
    let loggerMock: { error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> };
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
            // Resolves, rather than returning undefined. The previous mock returned nothing and
            // the test still passed, because `await undefined` is legal — so it never exercised
            // the promise the component actually depends on.
            logout: vi.fn().mockResolvedValue(undefined)
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
        loggerMock = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
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
                    { provide: Router, useValue: routerMock },
                    { provide: LoggerService, useValue: loggerMock }
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
        expect(component.userProfile()?.userName).toBe('Me');
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
        const toggleSpy = vi.spyOn(component.sidenav()!, 'toggle');
        component.toggleSidenav();
        expect(toggleSpy).toHaveBeenCalled();
    });

    it('should handle mobile breakpoint changes', () => {
        fixture.detectChanges();
        const closeSpy = vi.spyOn(component.sidenav()!, 'close');
        breakpointSubject.next({ matches: true }); // Mobile detected
        expect(component.isMobile()).toBe(true);
        expect(closeSpy).toHaveBeenCalled();
    });

    it('should open the sidenav again on the way back to desktop', () => {
        fixture.detectChanges();
        const openSpy = vi.spyOn(component.sidenav()!, 'open');

        breakpointSubject.next({ matches: false });

        expect(component.isMobile()).toBe(false);
        expect(openSpy).toHaveBeenCalled();
    });

    it('should track the chat page from router navigation', () => {
        fixture.detectChanges();
        expect(component.isChatPage()).toBe(false);

        routerEventsSubject.next(new NavigationEnd(1, '/chat/conv1', '/chat/conv1'));

        expect(component.isChatPage()).toBe(true);
    });

    it('should build the shareable user tag from the profile', () => {
        fixture.detectChanges();

        expect(component.userTag()).toBe('Me#1234');
    });

    it('should expose an empty tag until the profile arrives', () => {
        userSubject.next(null);
        fixture.detectChanges();

        expect(component.userTag()).toBe('');
    });

    it('should not copy anything when there is no profile', () => {
        // Guarding on the tag rather than the profile: an empty tag is the one thing that must
        // never reach the clipboard, and that is what the guard now reads.
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { clipboard: { writeText } });
        userSubject.next(null);
        fixture.detectChanges();

        component.copyUserTag();

        expect(writeText).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('should toggle and close the mobile menu', () => {
        fixture.detectChanges();

        component.toggleMobileMenu();
        expect(component.showMobileMenu()).toBe(true);

        component.onEscape();
        expect(component.showMobileMenu()).toBe(false);
    });

    it('should logout', () => {
        fixture.detectChanges();
        component.logout();
        expect(keycloakMock.logout).toHaveBeenCalled();
    });

    it('logs a failed logout instead of leaving it unhandled', async () => {
        fixture.detectChanges();
        (keycloakMock.logout as unknown as ReturnType<typeof vi.fn>)
            .mockReturnValue(Promise.reject(new Error('keycloak down')));

        component.logout();
        await Promise.resolve();
        await Promise.resolve();

        expect(loggerMock.error).toHaveBeenCalled();
    });

    it('closes the mobile menu only when the backdrop itself is clicked', () => {
        const backdrop = document.createElement('div');
        const panel = document.createElement('div');
        backdrop.appendChild(panel);

        component.toggleMobileMenu();
        component.dismissIfBackdrop({ target: panel, currentTarget: backdrop } as unknown as Event);
        expect(component.showMobileMenu()).toBe(true);

        component.dismissIfBackdrop({ target: backdrop, currentTarget: backdrop } as unknown as Event);
        expect(component.showMobileMenu()).toBe(false);
    });
});
