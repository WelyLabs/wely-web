import { Injectable } from '@angular/core';
import { KeycloakService } from 'keycloak-angular';
import { BehaviorSubject, Observable, from, of, throwError } from 'rxjs';
import { catchError, filter, map, switchMap, take } from 'rxjs/operators';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private refreshTimer: any;

    constructor(private keycloak: KeycloakService) { }

    /**
     * Planifie le prochain rafraîchissement du token de manière dynamique.
     * Calcule le temps restant avant expiration et programme un rafraîchissement 70s avant.
     */
    scheduleTokenRefresh() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        const keycloakInstance = this.keycloak.getKeycloakInstance();
        if (!keycloakInstance.tokenParsed || !keycloakInstance.tokenParsed.exp) {
            console.warn('[AuthService] No token expiration found. Falling back to 60s check.');
            this.refreshTimer = setTimeout(() => this.executeTokenUpdate(), 60000);
            return;
        }

        const expirationDate = keycloakInstance.tokenParsed.exp * 1000;
        const now = new Date().getTime();
        const delay = expirationDate - now - 70000; // Rafraîchir 70 secondes AVANT l'expiration

        console.log(`[AuthService] Next refresh scheduled in ${Math.round(delay / 1000)}s (at ${new Date(expirationDate - 70000).toLocaleTimeString()})`);

        this.refreshTimer = setTimeout(() => this.executeTokenUpdate(), Math.max(delay, 1000));
    }

    /**
     * Exécute la mise à jour effective du token et replanifie la suivante
     */
    private executeTokenUpdate() {
        from(this.keycloak.updateToken(70)).subscribe({
            next: (refreshed) => {
                if (refreshed) {
                    console.log('[AuthService] Token refreshed pro-actively.');
                }
                this.scheduleTokenRefresh(); // Re-planifier la suivante
            },
            error: (err) => {
                console.error('[AuthService] Proactive token refresh failed:', err);
                // En cas d'erreur réseau, on tente de re-planifier un peu plus tard
                this.refreshTimer = setTimeout(() => this.executeTokenUpdate(), 30000);
            }
        });
    }

    /**
     * Arrête la planification du rafraîchissement
     */
    stopTokenRefresh() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    /**
     * Vérifie si l'utilisateur est connecté
     */
    isLoggedIn(): Promise<boolean> {
        return Promise.resolve(this.keycloak.isLoggedIn());
    }

    /**
     * Déclenche la redirection vers le login
     */
    login(redirectUri?: string): Promise<void> {
        return this.keycloak.login({
            redirectUri: redirectUri || window.location.origin + window.location.pathname
        });
    }

    /**
     * Déconnexion
     */
    logout(): Promise<void> {
        this.stopTokenRefresh();
        return this.keycloak.logout(window.location.origin);
    }

    /**
     * Récupère le token actuel
     */
    getToken(): string {
        return this.keycloak.getKeycloakInstance().token || '';
    }
}
