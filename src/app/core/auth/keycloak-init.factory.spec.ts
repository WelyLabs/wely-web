import { LoggerService } from '../logging/logger.service';
import { initializeKeycloak, isOwnApiRequest } from './keycloak-init.factory';
import { HttpRequest } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('initializeKeycloak', () => {
    const loggerMock = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as LoggerService;
    let keycloakMock: any;
    let userServiceMock: any;
    let authServiceMock: any;

    beforeEach(() => {
        keycloakMock = {
            init: vi.fn()
        };
        userServiceMock = {
            loadAndSetCurrentUser: vi.fn()
        };
        authServiceMock = {
            scheduleTokenRefresh: vi.fn(),
            markStartupFailed: vi.fn()
        };
    });

    it('should initialize keycloak and preload data if authenticated', async () => {
        keycloakMock.init.mockResolvedValue(true);
        userServiceMock.loadAndSetCurrentUser.mockReturnValue(of({}));

        const initFn = initializeKeycloak(keycloakMock, userServiceMock, authServiceMock, loggerMock);
        await initFn();

        expect(keycloakMock.init).toHaveBeenCalled();
        expect(authServiceMock.scheduleTokenRefresh).toHaveBeenCalled();
        expect(userServiceMock.loadAndSetCurrentUser).toHaveBeenCalled();
    });

    it('should initialize keycloak and NOT preload data if NOT authenticated', async () => {
        keycloakMock.init.mockResolvedValue(false);

        const initFn = initializeKeycloak(keycloakMock, userServiceMock, authServiceMock, loggerMock);
        await initFn();

        expect(keycloakMock.init).toHaveBeenCalled();
        expect(authServiceMock.scheduleTokenRefresh).not.toHaveBeenCalled();
        expect(userServiceMock.loadAndSetCurrentUser).not.toHaveBeenCalled();
    });

    it('should handle user data preload failure gracefully', async () => {
        keycloakMock.init.mockResolvedValue(true);
        userServiceMock.loadAndSetCurrentUser.mockReturnValue(throwError(() => new Error('API Error')));

        const initFn = initializeKeycloak(keycloakMock, userServiceMock, authServiceMock, loggerMock);
        await initFn();

        expect(keycloakMock.init).toHaveBeenCalled();
        expect(userServiceMock.loadAndSetCurrentUser).toHaveBeenCalled();
        // Should not throw
    });

    it('should record the failure instead of rejecting when Keycloak cannot initialise', async () => {
        // A rejected initializer stops Angular from starting: the 2026-10-10 blank page.
        keycloakMock.init.mockRejectedValue({ error: 'unknown_error' });

        const initFn = initializeKeycloak(keycloakMock, userServiceMock, authServiceMock, loggerMock);

        await expect(initFn()).resolves.toBeUndefined();
        expect(authServiceMock.markStartupFailed).toHaveBeenCalled();
        expect(authServiceMock.scheduleTokenRefresh).not.toHaveBeenCalled();
        expect(userServiceMock.loadAndSetCurrentUser).not.toHaveBeenCalled();
    });
});

describe('isOwnApiRequest', () => {
    it('isOwnApiRequest_shouldSignCallsToOurApi', () => {
        expect(isOwnApiRequest(new HttpRequest('GET', `${environment.apiUrl}/events-service/events`))).toBe(true);
    });

    it('isOwnApiRequest_shouldNeverSendTheTokenToAThirdParty', () => {
        expect(isOwnApiRequest(new HttpRequest('GET', 'https://photon.komoot.io/api/?q=Lyon'))).toBe(false);
    });
});

describe('initializeKeycloak bearer options', () => {
    it('initializeKeycloak_shouldRestrictTheTokenToOurApi', async () => {
        const keycloak = { init: vi.fn().mockResolvedValue(false) };
        const auth = { scheduleTokenRefresh: vi.fn(), markStartupFailed: vi.fn() };
        const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

        await initializeKeycloak(keycloak as never, {} as never, auth as never, logger as never)();

        expect(keycloak.init.mock.calls[0][0].shouldAddToken).toBe(isOwnApiRequest);
    });
});
