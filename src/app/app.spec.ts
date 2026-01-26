import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { KeycloakService } from 'keycloak-angular';
import { UserService } from './services/user.service';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('App', () => {
  let keycloakMock: any;
  let userServiceMock: any;

  beforeEach(async () => {
    keycloakMock = {
      keycloakEvents$: of([]),
      isLoggedIn: vi.fn().mockResolvedValue(true),
      updateToken: vi.fn(),
      login: vi.fn()
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

  it('should have correct title signal', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect((app as any).title()).toBe('calendar-app');
  });
});
