import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { KeycloakService, KeycloakEventType } from 'keycloak-angular';
import { UserService } from './services/user.service';
import { of, Subject } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('App', () => {
  let keycloakMock: any;
  let userServiceMock: any;

  beforeEach(async () => {
    keycloakMock = {
      keycloakEvents$: of({}),
      isLoggedIn: vi.fn().mockResolvedValue(true),
      updateToken: vi.fn().mockResolvedValue(true),
      login: vi.fn().mockResolvedValue(true)
    };
    userServiceMock = {
      loadAndSetCurrentUser: vi.fn().mockReturnValue(of({}))
    };

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: KeycloakService, useValue: keycloakMock },
        { provide: UserService, useValue: userServiceMock }
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

    eventsSubject.next({ type: KeycloakEventType.TokenExpired });
    expect(keycloakMock.updateToken).toHaveBeenCalledWith(20);
  });

  it('should login on refresh error', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const eventsSubject = new Subject<any>();
    keycloakMock.keycloakEvents$ = eventsSubject.asObservable();

    await app.ngOnInit();

    eventsSubject.next({ type: KeycloakEventType.AuthRefreshError });
    expect(keycloakMock.login).toHaveBeenCalled();
  });

  it('should load user profile if logged in', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    keycloakMock.isLoggedIn.mockResolvedValue(true);

    await app.ngOnInit();

    expect(userServiceMock.loadAndSetCurrentUser).toHaveBeenCalled();
  });

  it('should not load user profile if not logged in', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    keycloakMock.isLoggedIn.mockResolvedValue(false);

    await app.ngOnInit();

    expect(userServiceMock.loadAndSetCurrentUser).not.toHaveBeenCalled();
  });
});
