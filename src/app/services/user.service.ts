import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, from, map, switchMap, zip } from 'rxjs';
import { KeycloakService } from 'keycloak-angular';
import { UnifiedUser, BusinessUser } from '../models/user.model';

@Injectable({
    providedIn: 'root'
})
export class UserService {
    private apiUrl = environment.apiUrl;

    constructor(
        private http: HttpClient,
        private keycloak: KeycloakService
    ) { }

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

    updateProfile(updates: { firstName: string; lastName: string; email: string }) {
        const keycloakUrl = 'http://localhost:8080'; // Should match KEYCLOAK_CONFIG.url
        const realm = 'calendar-app'; // Should match KEYCLOAK_CONFIG.realm
        const accountApiUrl = `${keycloakUrl}/realms/${realm}/account`;

        return this.http.post(accountApiUrl, updates);
    }

    uploadAvatar(file: File): Observable<any> {
        // Mock implementation for now, or use a real endpoint if available
        // const formData = new FormData();
        // formData.append('avatar', file);
        // return this.http.post(`${this.apiUrl}/users/me/avatar`, formData);

        // Simulate delay and success
        return new Observable(observer => {
            setTimeout(() => {
                observer.next({ success: true });
                observer.complete();
            }, 1000);
        });
    }
}
