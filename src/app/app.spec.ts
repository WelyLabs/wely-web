import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { App } from './app';
import { UserService } from './services/user.service';
import { AuthService } from './core/auth/auth.service';
import { ThemeService } from './services/theme.service';
import { AccountDeletionService } from './services/account-deletion.service';
import { NotificationService } from './services/notification.service';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('App', () => {
  let authServiceMock: { isLoggedIn: ReturnType<typeof vi.fn>; startupFailed: ReturnType<typeof signal<boolean>>;
    signInRefused: ReturnType<typeof signal<string | null>> };
  let userServiceMock: { loadAndSetCurrentUser: ReturnType<typeof vi.fn> };
  let themeMock: { sync: ReturnType<typeof vi.fn> };
  let accountDeletionMock: { cancelScheduledDeletion: ReturnType<typeof vi.fn> };
  let notificationsMock: { showBanner: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authServiceMock = {
      isLoggedIn: vi.fn().mockResolvedValue(true), startupFailed: signal(false), signInRefused: signal<string | null>(null)
    };
    userServiceMock = { loadAndSetCurrentUser: vi.fn().mockReturnValue(of({})) };
    themeMock = { sync: vi.fn() };
    accountDeletionMock = { cancelScheduledDeletion: vi.fn().mockResolvedValue(null) };
    notificationsMock = { showBanner: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: UserService, useValue: userServiceMock },
        { provide: ThemeService, useValue: themeMock },
        { provide: AccountDeletionService, useValue: accountDeletionMock },
        { provide: NotificationService, useValue: notificationsMock }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });

  it('ngOnInit_shouldLoadTheProfileAndTheAccountTheme_whenSignedIn', async () => {
    TestBed.createComponent(App).detectChanges();

    await vi.waitFor(() => expect(userServiceMock.loadAndSetCurrentUser).toHaveBeenCalled());
    expect(themeMock.sync).toHaveBeenCalledTimes(1);
  });

  it('ngOnInit_shouldSayTheDeletionIsCancelled_whenOneWasScheduled', async () => {
    accountDeletionMock.cancelScheduledDeletion.mockResolvedValue(new Date('2026-12-15T14:00:00Z'));

    TestBed.createComponent(App).detectChanges();

    await vi.waitFor(() => expect(notificationsMock.showBanner).toHaveBeenCalled());
    expect(notificationsMock.showBanner.mock.calls[0][0]).toContain('15 décembre 2026');
  });

  it('ngOnInit_shouldSayNothing_whenNoDeletionWasScheduled', async () => {
    TestBed.createComponent(App).detectChanges();

    await vi.waitFor(() => expect(accountDeletionMock.cancelScheduledDeletion).toHaveBeenCalled());
    expect(notificationsMock.showBanner).not.toHaveBeenCalled();
  });

  it('ngOnInit_shouldLoadNothing_whenSignedOut', async () => {
    authServiceMock.isLoggedIn.mockResolvedValue(false);

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(userServiceMock.loadAndSetCurrentUser).not.toHaveBeenCalled();
    expect(themeMock.sync).not.toHaveBeenCalled();
    expect(accountDeletionMock.cancelScheduledDeletion).not.toHaveBeenCalled();
  });

  it('should show the startup error screen, and nothing that needs a session, when Auth0 failed', () => {
    authServiceMock.startupFailed.set(true);
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('app-startup-error')).not.toBeNull();
    expect(element.querySelector('router-outlet')).toBeNull();
    expect(authServiceMock.isLoggedIn).not.toHaveBeenCalled();
    expect(userServiceMock.loadAndSetCurrentUser).not.toHaveBeenCalled();
  });

  it('should show the refusal screen rather than the outage one, when Auth0 said no', () => {
    authServiceMock.signInRefused.set('Confirmez votre adresse e-mail avant de vous connecter.');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Confirmez votre adresse e-mail');
    expect(text).not.toContain('Le service d\'authentification');
  });
});
