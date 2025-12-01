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
                    id: profile.id || apiUser.id,
                    username: profile.username || '',
                    email: profile.email || apiUser.email,
                    firstName: profile.firstName || apiUser.firstName,
                    lastName: profile.lastName || apiUser.lastName,
                    roles: this.keycloak.getUserRoles(),
                    originalJoinDate: apiUser.joinDate,
                    parsedJoinDate: new Date(apiUser.joinDate)
                } as UnifiedUser;
            })
        );
    }
}
