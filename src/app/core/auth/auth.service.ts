import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { LoggerService } from '../logging/logger.service';
import { KeycloakService } from 'keycloak-angular';
import { from } from 'rxjs';
import { removeWelyKeys, storageOrNull } from '../storage/web-storage';
import { ACCOUNT_DELETED_LANDING } from '../../models/account.model';

/** Replaces the whole page, dropping every connection and cache; a token so tests can watch it. */
export const REPLACE_PAGE = new InjectionToken<(url: string) => void>('REPLACE_PAGE', {
    providedIn: 'root',
    factory: () => (url: string) => window.location.replace(url)
});

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private readonly logger = inject(LoggerService);
    private keycloak = inject(KeycloakService);
    private readonly replacePage = inject(REPLACE_PAGE);

    private readonly startupFailedState = signal(false);
    private readonly sessionEndedState = signal(false);

    /** True when Keycloak could not be initialised: the app shows an error screen instead of a blank page. */
    readonly startupFailed = this.startupFailedState.asReadonly();

    /** True once the account is deleted and the page is being replaced: nothing may start a login any more. */
    readonly sessionEnded = this.sessionEndedState.asReadonly();

    markStartupFailed(): void {
        this.startupFailedState.set(true);
    }

    /** Browser timer handle; `number` in the DOM, not NodeJS.Timeout. */
    private refreshTimer?: ReturnType<typeof setTimeout>;

    /** Schedules the next token refresh 70 s before the token expires. */
    scheduleTokenRefresh() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        const keycloakInstance = this.keycloak.getKeycloakInstance();
        if (!keycloakInstance.tokenParsed || !keycloakInstance.tokenParsed.exp) {
            this.logger.warn('AuthService', '[AuthService] No token expiration found. Falling back to 60s check.');
            this.refreshTimer = setTimeout(() => this.executeTokenUpdate(), 60000);
            return;
        }

        const expirationDate = keycloakInstance.tokenParsed.exp * 1000;
        const now = new Date().getTime();
        const delay = expirationDate - now - 70000; // Refresh 70 seconds BEFORE expiry

        this.logger.debug('AuthService', `[AuthService] Next refresh scheduled in ${Math.round(delay / 1000)}s (at ${new Date(expirationDate - 70000).toLocaleTimeString()})`);

        this.refreshTimer = setTimeout(() => this.executeTokenUpdate(), Math.max(delay, 1000));
    }

    /** Refreshes the token, then schedules the next refresh. */
    private executeTokenUpdate() {
        from(this.keycloak.updateToken(70)).subscribe({
            next: (refreshed) => {
                if (refreshed) {
                    this.logger.debug('AuthService', '[AuthService] Token refreshed pro-actively.');
                }
                this.scheduleTokenRefresh();
            },
            error: (err) => {
                this.logger.error('AuthService', '[AuthService] Proactive token refresh failed:', err);
                // A network failure is retried a little later.
                this.refreshTimer = setTimeout(() => this.executeTokenUpdate(), 30000);
            }
        });
    }

    /** Stops the scheduled token refresh. */
    stopTokenRefresh() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = undefined;
        }
    }

    /** Whether the user is signed in. */
    isLoggedIn(): Promise<boolean> {
        return Promise.resolve(this.keycloak.isLoggedIn());
    }

    /** Redirects to the Keycloak login. */
    login(redirectUri?: string): Promise<void> {
        return this.keycloak.login({
            redirectUri: redirectUri || window.location.origin + window.location.pathname
        });
    }

    /** Forces a full sign-in, even with a live SSO session, then comes back to the redirect. */
    reauthenticate(redirectUri: string, loginHint?: string): Promise<void> {
        return this.keycloak.login({ prompt: 'login', redirectUri, loginHint });
    }

    /** When the user last signed in with their credentials, on this device's clock; null when the token does not say. */
    authenticatedAt(): number | null {
        const instance = this.keycloak.getKeycloakInstance();
        const authTime = instance.tokenParsed?.auth_time;
        return authTime === undefined ? null : (authTime + (instance.timeSkew ?? 0)) * 1000;
    }

    /** Signs out at Keycloak and comes back to the landing page. */
    logout(): Promise<void> {
        this.stopTokenRefresh();
        return this.keycloak.logout(window.location.origin);
    }

    /** The current access token, or an empty string. */
    getToken(): string {
        return this.keycloak.getKeycloakInstance().token || '';
    }

    /** Ends this device's session after the account was deleted, once, and replaces the page with the landing. */
    leaveAfterAccountDeletion(): void {
        if (this.sessionEndedState()) {
            return;
        }
        this.sessionEndedState.set(true);
        this.stopTokenRefresh();
        removeWelyKeys(storageOrNull('local'));
        removeWelyKeys(storageOrNull('session'));
        try {
            this.keycloak.clearToken();
        } catch (error) {
            this.logger.warn('AuthService', 'Could not clear the token before leaving', error);
        }
        this.replacePage(ACCOUNT_DELETED_LANDING);
    }
}
