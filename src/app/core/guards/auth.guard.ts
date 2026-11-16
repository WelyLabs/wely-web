import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthService } from '../auth/auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
    const authService = inject(AuthService);

    // Redirecting to Auth0 after it failed would loop; the error screen is shown instead.
    if (authService.startupFailed()) {
        return false;
    }

    if (!(await authService.isLoggedIn())) {
        await authService.login(state.url);
        return false;
    }

    return true;
};
