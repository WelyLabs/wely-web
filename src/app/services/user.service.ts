import { Injectable, inject } from '@angular/core';
import { LoggerService } from '../core/logging/logger.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import { KeycloakService } from 'keycloak-angular';
import { User } from '../models/user.model';

@Injectable({
    providedIn: 'root'
})
export class UserService {
    private readonly logger = inject(LoggerService);
    private http = inject(HttpClient);
    private keycloak = inject(KeycloakService);

    private apiUrl = `${environment.apiUrl}/user-service`;

    // BehaviorSubject to hold the current user state
    private currentUserSubject = new BehaviorSubject<User | null>(null);

    // Observable that components can subscribe to
    public currentUser$ = this.currentUserSubject.asObservable();

    /**
     * Load user data and update the BehaviorSubject
     * This will notify all subscribers automatically
     */
    loadAndSetCurrentUser(): Observable<User> {
        return this.getMe().pipe(
            tap(user => this.currentUserSubject.next(user))
        );
    }

    /**
     * Get the current user value synchronously
     */
    getCurrentUserValue(): User | null {
        return this.currentUserSubject.value;
    }

    /**
     * Get the current access token synchronously
     */
    getAccessToken(): string {
        return this.keycloak.getKeycloakInstance().token!;
    }

    /**
     * Update the current user in the BehaviorSubject
     * Use this after profile updates to propagate changes
     */
    updateCurrentUser(updates: Partial<User>): void {
        const currentUser = this.currentUserSubject.value;
        if (currentUser) {
            this.currentUserSubject.next({
                ...currentUser,
                ...updates
            });
        }
    }

    /**
     * Fetch user data from API
     */
    getMe(): Observable<User> {
        return this.http.get<User>(`${this.apiUrl}/profile`);
    }

    updateProfile(updates: { username: string; firstName: string; lastName: string; email: string }) {
        return this.http.put(`${this.apiUrl}/profile`, updates);
    }

    uploadAvatar(file: File): Observable<{ profilePicUrl: string }> {
        const formData = new FormData();
        formData.append('file', file);

        this.logger.debug('UserService', '📤 Uploading avatar file:', file.name, file.type, file.size);

        // Backend returns a plain string (the URL), not a JSON object
        return this.http.post(`${this.apiUrl}/profile/picture`, formData, { responseType: 'text' }).pipe(
            tap(url => {
                this.logger.debug('UserService', '✅ Upload successful, URL received:', url);
            }),
            tap(url => {
                // Update the current user with the new avatar URL
                this.updateCurrentUser({ profilePicUrl: url });
                this.logger.debug('UserService', '✅ User updated with new avatar URL:', url);
            }),
            tap({
                error: (error) => {
                    this.logger.error('UserService', '❌ Upload failed with error:', error);
                    this.logger.error('UserService', 'Error status:', error.status);
                    this.logger.error('UserService', 'Error message:', error.message);
                    this.logger.error('UserService', 'Error body:', error.error);
                }
            }),
            // Transform string to object
            tap(() => { }), // placeholder to maintain chain
        ) as unknown as Observable<{ profilePicUrl: string }>;
    }
}
