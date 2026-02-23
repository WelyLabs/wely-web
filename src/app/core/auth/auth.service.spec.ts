import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { KeycloakService } from 'keycloak-angular';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';

describe('AuthService', () => {
    let service: AuthService;
    let keycloakMock: any;

    beforeEach(() => {
        keycloakMock = {
            getKeycloakInstance: vi.fn().mockReturnValue({
                tokenParsed: { exp: (new Date().getTime() / 1000) + 1000 },
                token: 'mock-token'
            }),
            updateToken: vi.fn().mockReturnValue(Promise.resolve(true)),
            isLoggedIn: vi.fn().mockReturnValue(true),
            login: vi.fn().mockReturnValue(Promise.resolve()),
            logout: vi.fn().mockReturnValue(Promise.resolve())
        };

        TestBed.configureTestingModule({
            providers: [
                AuthService,
                { provide: KeycloakService, useValue: keycloakMock }
            ]
        });
        service = TestBed.inject(AuthService);
        vi.useFakeTimers();
    });

    afterEach(() => {
        service.stopTokenRefresh();
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
        const exp = (now + 200000) / 1000; // 200s in the future
        
        keycloakMock.getKeycloakInstance.mockReturnValue({
            tokenParsed: { exp: exp }
        });

        const consoleSpy = vi.spyOn(console, 'log');
        service.scheduleTokenRefresh();

        // 200s - 70s = 130s delay
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Next refresh scheduled in 130s'));
    });

    it('should fallback to 60s check if no exp found', () => {
        keycloakMock.getKeycloakInstance.mockReturnValue({
            tokenParsed: {}
        });

        const consoleSpy = vi.spyOn(console, 'warn');
        service.scheduleTokenRefresh();

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No token expiration found'));
    });

    it('should execute token update and reschedule', async () => {
        service.scheduleTokenRefresh();
        
        // Trigger the timer
        vi.runAllTimers();

        expect(keycloakMock.updateToken).toHaveBeenCalledWith(70);
        // It should reconstruct the timer après le next habituel
        // Mais comme c'est asynchrone dans le subscribe (from promise), 
        // on doit attendre la résolution de la promise
        await vi.runAllTimersAsync();
        
        // On vérifie qu'il a replanifié (on regarde si getKeycloakInstance a été rappelé)
        expect(keycloakMock.getKeycloakInstance).toHaveBeenCalled();
    });

    it('should retry token update later on failure', async () => {
        keycloakMock.updateToken.mockReturnValue(Promise.reject('error'));
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        service.scheduleTokenRefresh();
        vi.runAllTimers();

        await vi.runAllTimersAsync();
        expect(consoleSpy).toHaveBeenCalled();
        
        // Should have scheduled a retry in 30s
        // run 30s more
        vi.advanceTimersByTime(30000);
        expect(keycloakMock.updateToken).toHaveBeenCalledTimes(2);
    });

    it('should stop token refresh', () => {
        service.scheduleTokenRefresh();
        service.stopTokenRefresh();
        
        vi.runAllTimers();
        expect(keycloakMock.updateToken).not.toHaveBeenCalled();
    });
});
