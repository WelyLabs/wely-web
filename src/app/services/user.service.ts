import { Injectable, inject } from '@angular/core';
import { LoggerService } from '../core/logging/logger.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, BehaviorSubject, catchError, from, map, of, switchMap, tap } from 'rxjs';
import { KeycloakService } from 'keycloak-angular';
import { User } from '../models/user.model';

/** What the profile form may change; the email stays with Keycloak. */
/** What a user says about themselves on their profile. No bio is null, no interest an empty list. */
export interface ProfileAbout {
    bio: string | null;
    interests: string[];
}

/** wely-users' limits, mirrored so the form says so before sending. */
export const ABOUT_LIMITS = { bio: 160, interests: 5, interest: 24 } as const;

/** A friend's profile, as wely-users shows it to their friends only. */
export interface FriendProfile {
    id: string;
    userName: string;
    hashtag: number;
    firstName: string;
    lastName: string;
    /** ISO local date-time, without a zone. */
    joinedDate: string | null;
    bio: string | null;
    interests: string[];
}

export interface ProfileUpdate {
    userName: string;
    firstName: string;
    lastName: string;
}

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

    /**
     * Saves the caller's username and names; wely-users answers with the profile as stored (the
     * username lowercased, as Keycloak keeps it). The current user follows, and the token is
     * refreshed at once: its preferred_username is the name wely-chat signs messages with.
     * A failed refresh is not the save failing: the scheduled one will catch up.
     */
    /** A friend's profile; 403 when the two are not friends. */
    getFriendProfile(userId: string): Observable<FriendProfile> {
        return this.http.get<FriendProfile>(`${this.apiUrl}/users/${userId}/profile`);
    }

    /** The signed-in user's bio and interests. */
    getAbout(): Observable<ProfileAbout> {
        return this.http.get<ProfileAbout>(`${this.apiUrl}/profile/about`);
    }

    /** Answers with what was stored: tidied, duplicates removed. */
    updateAbout(about: ProfileAbout): Observable<ProfileAbout> {
        return this.http.put<ProfileAbout>(`${this.apiUrl}/profile/about`, about);
    }

    updateProfile(update: ProfileUpdate): Observable<User> {
        return this.http.put<User>(`${this.apiUrl}/profile`, update).pipe(
            tap(saved => this.updateCurrentUser({
                userName: saved.userName,
                firstName: saved.firstName,
                lastName: saved.lastName
            })),
            switchMap(saved => from(this.keycloak.updateToken(-1)).pipe(
                map(() => saved),
                catchError(() => of(saved))))
        );
    }

    /**
     * Replaces the current user's picture. wely-users answers a signed URL for it; screens read
     * pictures through AvatarService, which the caller invalidates for the current user.
     */
    uploadAvatar(file: File): Observable<{ profilePicUrl: string }> {
        const formData = new FormData();
        formData.append('file', file);
        return this.http.post<{ profilePicUrl: string }>(`${this.apiUrl}/profile/picture`, formData);
    }
}
