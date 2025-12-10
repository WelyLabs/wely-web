import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, from, map, switchMap, zip, BehaviorSubject, tap } from 'rxjs';
import { KeycloakService } from 'keycloak-angular';
import { UnifiedUser, BusinessUser, UserWithStatusDTO } from '../models/user.model';

@Injectable({
    providedIn: 'root'
})
export class UserService {
    private apiUrl = environment.apiUrl;

    // BehaviorSubject to hold the current user state
    private currentUserSubject = new BehaviorSubject<UnifiedUser | null>(null);

    // Observable that components can subscribe to
    public currentUser$ = this.currentUserSubject.asObservable();

    constructor(
        private http: HttpClient,
        private keycloak: KeycloakService
    ) { }

    /**
     * Load user data and update the BehaviorSubject
     * This will notify all subscribers automatically
     */
    loadAndSetCurrentUser(): Observable<UnifiedUser> {
        return this.getMe().pipe(
            tap(user => this.currentUserSubject.next(user))
        );
    }

    /**
     * Get the current user value synchronously
     */
    getCurrentUserValue(): UnifiedUser | null {
        return this.currentUserSubject.value;
    }

    /**
     * Update the current user in the BehaviorSubject
     * Use this after profile updates to propagate changes
     */
    updateCurrentUser(updates: Partial<UnifiedUser>): void {
        const currentUser = this.currentUserSubject.value;
        if (currentUser) {
            this.currentUserSubject.next({
                ...currentUser,
                ...updates
            });
        }
    }

    /**
     * Fetch user data from Keycloak and API
     * This is the base method, prefer using loadAndSetCurrentUser() in components
     */
    getMe(): Observable<UnifiedUser> {
        const keycloakProfile$ = from(this.keycloak.loadUserProfile());
        const apiUser$ = this.http.get<BusinessUser>(`${this.apiUrl}/users/me`);

        return zip(keycloakProfile$, apiUser$).pipe(
            map(([profile, apiUser]) => {
                return {
                    ...apiUser,
                    id: profile.id,
                    username: profile.username,
                    email: profile.email,
                    firstName: profile.firstName,
                    lastName: profile.lastName,
                    roles: this.keycloak.getUserRoles(),
                    originalJoinedDate: apiUser.joinedDate,
                    parsedJoinedDate: new Date(apiUser.joinedDate)
                } as UnifiedUser;
            })
        );
    }

    updateProfile(updates: { username: string; firstName: string; lastName: string; email: string }) {
        const keycloakUrl = 'http://localhost:8080'; // Should match KEYCLOAK_CONFIG.url
        const realm = 'calendar-app'; // Should match KEYCLOAK_CONFIG.realm
        const accountApiUrl = `${keycloakUrl}/realms/${realm}/account`;

        return this.http.post(accountApiUrl, updates);
    }

    uploadAvatar(file: File): Observable<{ profilePicUrl: string }> {
        const formData = new FormData();
        formData.append('file', file);

        console.log('📤 Uploading avatar file:', file.name, file.type, file.size);

        // Backend returns a plain string (the URL), not a JSON object
        return this.http.post(`${this.apiUrl}/users/me/profilePicture`, formData, { responseType: 'text' }).pipe(
            map(url => {
                console.log('✅ Upload successful, URL received:', url);
                // Convert string response to expected object format
                return { profilePicUrl: url };
            }),
            tap(response => {
                // Update the current user with the new avatar URL
                this.updateCurrentUser({ profilePicUrl: response.profilePicUrl });
                console.log('✅ User updated with new avatar URL:', response.profilePicUrl);
            }),
            tap({
                error: (error) => {
                    console.error('❌ Upload failed with error:', error);
                    console.error('Error status:', error.status);
                    console.error('Error message:', error.message);
                    console.error('Error body:', error.error);
                }
            })
        );
    }

    searchUsers(): Observable<UserWithStatusDTO[]> {
        return this.http.get<UserWithStatusDTO[]>(`${this.apiUrl}/users`);
    }
}
