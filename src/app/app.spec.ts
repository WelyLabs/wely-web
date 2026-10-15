import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { KeycloakService, KeycloakEventTypeLegacy } from 'keycloak-angular';
import { UserService } from './services/user.service';
import { AuthService, REPLACE_PAGE } from './core/auth/auth.service';
import { ThemeService } from './services/theme.service';
import { of, Subject } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('App', () => {
  let keycloakMock: any;
  let userServiceMock: any;
  let themeMock: { sync: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    keycloakMock = {
      keycloakEvents$: of({}),
      isLoggedIn: vi.fn().mockReturnValue(true),
      updateToken: vi.fn().mockResolvedValue(true),
      login: vi.fn().mockResolvedValue(true),
      clearToken: vi.fn()
    };
    userServiceMock = {
      loadAndSetCurrentUser: vi.fn().mockReturnValue(of({}))
    };
    themeMock = { sync: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: KeycloakService, useValue: keycloakMock },
        { provide: UserService, useValue: userServiceMock },
        { provide: ThemeService, useValue: themeMock },
        { provide: REPLACE_PAGE, useValue: vi.fn() }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should handle token expiration and refresh', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const eventsSubject = new Subject<any>();
    keycloakMock.keycloakEvents$ = eventsSubject.asObservable();

    await app.ngOnInit();

    // keycloakEvents$ emits KeycloakEventTypeLegacy. This test used to emit a member of
    // the newer KeycloakEventType enum, which the component compared against after an
    // `as any` cast — so the test matched while production never did, and the handler
    // was dead.
    eventsSubject.next({ type: KeycloakEventTypeLegacy.OnTokenExpired });
    expect(keycloakMock.updateToken).toHaveBeenCalledWith(20);
  });

  it('should login on refresh error', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const eventsSubject = new Subject<any>();
    keycloakMock.keycloakEvents$ = eventsSubject.asObservable();

    await app.ngOnInit();

    eventsSubject.next({ type: KeycloakEventTypeLegacy.OnAuthRefreshError });
    expect(keycloakMock.login).toHaveBeenCalled();
  });

  it('should load user profile if logged in', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    keycloakMock.isLoggedIn.mockReturnValue(true);

    app.ngOnInit();

    expect(userServiceMock.loadAndSetCurrentUser).toHaveBeenCalled();
  });

  it('should take up the theme kept with the account once signed in', () => {
    const fixture = TestBed.createComponent(App);
    keycloakMock.isLoggedIn.mockReturnValue(true);

    fixture.componentInstance.ngOnInit();

    expect(themeMock.sync).toHaveBeenCalledTimes(1);
  });

  it('should not load user profile if not logged in', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    keycloakMock.isLoggedIn.mockReturnValue(false);

    app.ngOnInit();

    expect(userServiceMock.loadAndSetCurrentUser).not.toHaveBeenCalled();
    expect(themeMock.sync).not.toHaveBeenCalled();
  });

  it('should show the startup error screen, and nothing that needs a session, when Keycloak failed', () => {
    TestBed.inject(AuthService).markStartupFailed();
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('app-startup-error')).not.toBeNull();
    expect(element.querySelector('router-outlet')).toBeNull();
    expect(keycloakMock.isLoggedIn).not.toHaveBeenCalled();
    expect(userServiceMock.loadAndSetCurrentUser).not.toHaveBeenCalled();
  });

  it('ngOnInit_shouldNotLogin_onRefreshError_whenTheSessionHasEnded', async () => {
    const fixture = TestBed.createComponent(App);
    const eventsSubject = new Subject<any>();
    keycloakMock.keycloakEvents$ = eventsSubject.asObservable();
    fixture.componentInstance.ngOnInit();
    TestBed.inject(AuthService).leaveAfterAccountDeletion();

    eventsSubject.next({ type: KeycloakEventTypeLegacy.OnAuthRefreshError });

    expect(keycloakMock.login).not.toHaveBeenCalled();
  });

  it('ngOnInit_shouldNotLogin_onTokenExpiry_whenTheSessionHasEnded', async () => {
    const fixture = TestBed.createComponent(App);
    const eventsSubject = new Subject<any>();
    keycloakMock.keycloakEvents$ = eventsSubject.asObservable();
    keycloakMock.updateToken.mockRejectedValue(new Error('refresh refused'));
    fixture.componentInstance.ngOnInit();
    TestBed.inject(AuthService).leaveAfterAccountDeletion();

    eventsSubject.next({ type: KeycloakEventTypeLegacy.OnTokenExpired });
    await Promise.resolve();
    await Promise.resolve();

    expect(keycloakMock.updateToken).toHaveBeenCalledWith(20);
    expect(keycloakMock.login).not.toHaveBeenCalled();
  });

  it('ngOnInit_shouldLogin_onTokenExpiry_whenTheRefreshFails', async () => {
    const fixture = TestBed.createComponent(App);
    const eventsSubject = new Subject<any>();
    keycloakMock.keycloakEvents$ = eventsSubject.asObservable();
    keycloakMock.updateToken.mockRejectedValue(new Error('refresh refused'));
    fixture.componentInstance.ngOnInit();

    eventsSubject.next({ type: KeycloakEventTypeLegacy.OnTokenExpired });

    await vi.waitFor(() => expect(keycloakMock.login).toHaveBeenCalled());
  });
});
