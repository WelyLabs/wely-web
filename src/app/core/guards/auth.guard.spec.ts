import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../auth/auth.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('authGuard', () => {
    let authServiceMock: {
        isLoggedIn: ReturnType<typeof vi.fn>;
        login: ReturnType<typeof vi.fn>;
        startupFailed: ReturnType<typeof signal<boolean>>;
    };
    const run = (url: string) => TestBed.runInInjectionContext(() =>
        authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));

    beforeEach(() => {
        authServiceMock = { isLoggedIn: vi.fn(), login: vi.fn().mockResolvedValue(undefined), startupFailed: signal(false) };
        TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: authServiceMock }] });
    });

    it('authGuard_shouldAllow_whenLoggedIn', async () => {
        authServiceMock.isLoggedIn.mockResolvedValue(true);

        expect(await run('/test')).toBe(true);
        expect(authServiceMock.login).not.toHaveBeenCalled();
    });

    it('authGuard_shouldLoginBackToTheRoute_whenNotLoggedIn', async () => {
        authServiceMock.isLoggedIn.mockResolvedValue(false);

        expect(await run('/protected?x=1')).toBe(false);
        expect(authServiceMock.login).toHaveBeenCalledWith('/protected?x=1');
    });

    it('authGuard_shouldNeitherRedirectNorAllow_onceStartupHasFailed', async () => {
        // Redirecting to an Auth0 that just failed would loop between the two.
        authServiceMock.startupFailed.set(true);

        expect(await run('/calendar')).toBe(false);
        expect(authServiceMock.login).not.toHaveBeenCalled();
        expect(authServiceMock.isLoggedIn).not.toHaveBeenCalled();
    });
});
