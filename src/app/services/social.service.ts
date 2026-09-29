import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { RelationStatus, UserNodeDTO, UserWithStatusDTO } from '../models/user.model';

/** Filters the social service accepts on its user listing. */
export type FriendshipFilter = 'FRIENDS' | 'PENDING_INCOMING' | 'PENDING_OUTGOING';

@Injectable({ providedIn: 'root' })
export class SocialService {
    private readonly http = inject(HttpClient);
    private readonly apiUrl = `${environment.apiUrl}/social-service`;

    /**
     * Lists users. Without a filter, every user with the caller's relationship status
     * to each of them; with one, only that subset.
     */
    searchUsers(friendshipStatus?: FriendshipFilter): Observable<UserWithStatusDTO[]> {
        let params = new HttpParams();
        if (friendshipStatus) {
            params = params.set('friendshipStatus', friendshipStatus);
        }
        return this.http.get<UserWithStatusDTO[]>(`${this.apiUrl}/users`, { params });
    }

    /** Sends a friend request by public tag, `Name#1234`. */
    sendFriendRequest(userTag: string): Observable<UserNodeDTO> {
        return this.http.post<UserNodeDTO>(`${this.apiUrl}/relationships/request`, { userTag });
    }

    /** Accepts an incoming request. The backend answers 204. */
    acceptFriend(userId: string): Observable<void> {
        return this.http.put<void>(`${this.apiUrl}/relationships/accept/${userId}`, {});
    }

    rejectFriend(userId: string): Observable<void> {
        return this.http.put<void>(`${this.apiUrl}/relationships/reject/${userId}`, {});
    }

    removeFriend(userId: string): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/relationships/${userId}`);
    }
}

export type { RelationStatus };
