import { KeycloakService } from 'keycloak-angular';
import { UserService } from '../../services/user.service';
import { initializeKeycloak } from './keycloak-init.factory';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('initializeKeycloak', () => {
    let keycloakMock: any;
    let userServiceMock: any;

    beforeEach(() => {
        keycloakMock = {
            init: vi.fn()
        };
        userServiceMock = {
            loadAndSetCurrentUser: vi.fn()
        };
    });

    it('should initialize keycloak and preload data if authenticated', async () => {
        keycloakMock.init.mockResolvedValue(true);
        userServiceMock.loadAndSetCurrentUser.mockReturnValue(of({}));

        const initFn = initializeKeycloak(keycloakMock, userServiceMock);
        await initFn();

        expect(keycloakMock.init).toHaveBeenCalled();
        expect(userServiceMock.loadAndSetCurrentUser).toHaveBeenCalled();
    });

    it('should initialize keycloak and NOT preload data if NOT authenticated', async () => {
        keycloakMock.init.mockResolvedValue(false);

        const initFn = initializeKeycloak(keycloakMock, userServiceMock);
        await initFn();

        expect(keycloakMock.init).toHaveBeenCalled();
        expect(userServiceMock.loadAndSetCurrentUser).not.toHaveBeenCalled();
    });

    it('should handle user data preload failure gracefully', async () => {
        keycloakMock.init.mockResolvedValue(true);
        userServiceMock.loadAndSetCurrentUser.mockReturnValue(throwError(() => new Error('API Error')));

        const initFn = initializeKeycloak(keycloakMock, userServiceMock);
        await initFn();

        expect(keycloakMock.init).toHaveBeenCalled();
        expect(userServiceMock.loadAndSetCurrentUser).toHaveBeenCalled();
        // Should not throw
    });
});
