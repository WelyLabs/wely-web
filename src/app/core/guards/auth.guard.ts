import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { KeycloakService } from 'keycloak-angular';
import { AuthService } from '../auth/auth.service';

export const authGuard: CanActivateFn = async (route, state) => {
    const keycloak = inject(KeycloakService);

    // Redirecting to Keycloak after it failed would loop; the error screen is shown instead.
    if (inject(AuthService).startupFailed()) {
        return false;
    }

    const isLoggedIn = await keycloak.isLoggedIn();

    if (!isLoggedIn) {
        await keycloak.login({
            redirectUri: window.location.origin + state.url
        });
        return false;
    }

    return true;
};
