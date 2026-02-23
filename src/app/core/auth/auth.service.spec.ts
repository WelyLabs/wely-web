import 'zone.js';
import 'zone.js/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { KeycloakService } from 'keycloak-angular';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('AuthService', () => {
    let service: AuthService;
    let keycloakMock: Partial<KeycloakService>;

    beforeEach(() => {
        TestBed.resetTestingModule();
        vi.useFakeTimers();
        vi.clearAllMocks();

        keycloakMock = {
            getKeycloakInstance: vi.fn().mockReturnValue({
                tokenParsed: { exp: (new Date().getTime() / 1000) + 1000 },
                token: 'mock-token'
            }),
            updateToken: vi.fn().mockReturnValue(Promise.resolve(true)),
            isLoggedIn: vi.fn().mockReturnValue(true),
            login: vi.fn().mockReturnValue(Promise.resolve()),
            logout: vi.fn().mockReturnValue(Promise.resolve())
        } as any; // Cast to any for the factory setup, but variable is Partial<KeycloakService>

        TestBed.configureTestingModule({
            providers: [
                AuthService,
                { provide: KeycloakService, useValue: keycloakMock }
            ]
        });
        service = TestBed.inject(AuthService);
    });

    afterEach(() => {
        if (service) {
            service.stopTokenRefresh();
        }
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('should get token', () => {
        expect(service.getToken()).toBe('mock-token');
    });

    it('should check if logged in', async () => {
        const loggedIn = await service.isLoggedIn();
        expect(loggedIn).toBe(true);
        expect(keycloakMock.isLoggedIn).toHaveBeenCalled();
    });

    it('should login', async () => {
        await service.login('redirect');
        expect(keycloakMock.login).toHaveBeenCalledWith({ redirectUri: 'redirect' });
    });

    it('should logout', async () => {
        await service.logout();
        expect(keycloakMock.logout).toHaveBeenCalled();
    });

    it('should schedule token refresh based on exp', () => {
        const now = new Date().getTime();
        const exp = (now + 200000) / 1000;

        (keycloakMock.getKeycloakInstance as any).mockReturnValue({
            tokenParsed: { exp: exp }
        });

        const consoleSpy = vi.spyOn(console, 'log');
        service.scheduleTokenRefresh();

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Next refresh scheduled in 130s'));
    });

    it('should fallback to 60s check if no exp found', () => {
        (keycloakMock.getKeycloakInstance as any).mockReturnValue({
            tokenParsed: {}
        });

        const consoleSpy = vi.spyOn(console, 'warn');
        service.scheduleTokenRefresh();

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No token expiration found'));
    });

    it('should execute token update and reschedule', async () => {
        (keycloakMock.getKeycloakInstance as any).mockClear();

        service.scheduleTokenRefresh();
        expect(keycloakMock.getKeycloakInstance).toHaveBeenCalledTimes(1);

        await vi.advanceTimersToNextTimerAsync();

        expect(keycloakMock.updateToken).toHaveBeenCalledWith(70);
        expect(keycloakMock.getKeycloakInstance).toHaveBeenCalledTimes(2);
    });

    it('should retry token update later on failure', async () => {
        // 1. Setup failure mock
        (keycloakMock.updateToken as any).mockReturnValue(Promise.reject('error'));
        (keycloakMock.getKeycloakInstance as any).mockClear();
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // 2. Start refresh cycle
        service.scheduleTokenRefresh();

        // 3. Move to first update attempt (Timer 1)
        await vi.runOnlyPendingTimersAsync();
        expect(keycloakMock.updateToken).toHaveBeenCalledTimes(1);
        expect(consoleSpy).toHaveBeenCalled();

        // 4. Move to retry attempt (Timer 2, 30s later)
        // We use runOnlyPendingTimersAsync to be exact
        await vi.runOnlyPendingTimersAsync();

        expect(keycloakMock.updateToken).toHaveBeenCalledTimes(2);
    });

    it('should stop token refresh', () => {
        service.scheduleTokenRefresh();
        service.stopTokenRefresh();

        vi.runAllTimers();
        expect(keycloakMock.updateToken).not.toHaveBeenCalled();
    });
});
