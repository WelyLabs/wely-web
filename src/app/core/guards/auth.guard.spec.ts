import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { KeycloakService } from 'keycloak-angular';
import { authGuard } from './auth.guard';
import { AuthService } from '../auth/auth.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('authGuard', () => {
    let keycloakMock: any;
    let routerMock: any;

    beforeEach(() => {
        keycloakMock = {
            isLoggedIn: vi.fn(),
            login: vi.fn()
        };
        routerMock = {};

        TestBed.configureTestingModule({
            providers: [
                { provide: KeycloakService, useValue: keycloakMock },
                { provide: Router, useValue: routerMock }
            ]
        });
    });

    it('should return true if user is logged in', async () => {
        keycloakMock.isLoggedIn.mockResolvedValue(true);

        const result = await TestBed.runInInjectionContext(() =>
            authGuard({} as any, { url: '/test' } as any)
        );

        expect(result).toBe(true);
    });

    it('should call login and return false if user is NOT logged in', async () => {
        keycloakMock.isLoggedIn.mockResolvedValue(false);
        keycloakMock.login.mockResolvedValue({});

        const result = await TestBed.runInInjectionContext(() =>
            authGuard({} as any, { url: '/protected' } as any)
        );

        expect(keycloakMock.login).toHaveBeenCalledWith(expect.objectContaining({
            redirectUri: expect.stringContaining('/protected')
        }));
        expect(result).toBe(false);
    });

    it('should neither redirect to Keycloak nor allow access once startup has failed', async () => {
        // Redirecting to a Keycloak that just failed would loop between the two.
        TestBed.inject(AuthService).markStartupFailed();

        const result = await TestBed.runInInjectionContext(() =>
            authGuard({} as any, { url: '/calendar' } as any)
        );

        expect(result).toBe(false);
        expect(keycloakMock.login).not.toHaveBeenCalled();
        expect(keycloakMock.isLoggedIn).not.toHaveBeenCalled();
    });
});
