import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';
import { UserWithStatusDTO } from '../models/user.model';

@Injectable({
    providedIn: 'root'
})
export class SocialService {
    private apiUrl = `${environment.apiUrl}/social-service`;

    constructor(private http: HttpClient) { }

    /**
     * Search users or fetch friends based on relation status
     */
    searchUsers(relationStatus?: string): Observable<UserWithStatusDTO[]> {
        let params = new HttpParams();
        if (relationStatus) {
            params = params.set('friendshipStatus', relationStatus);
        }
        return this.http.get<UserWithStatusDTO[]>(`${this.apiUrl}/users`, { params });
    }

    /**
     * Send a friend request using the user's tag (Name#Hashtag)
     */
    sendFriendRequest(userTag: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/relationships/request`, { userTag });
    }

    /**
     * Accept an incoming friend request
     */
    acceptFriend(userId: number): Observable<any> {
        return this.http.put(`${this.apiUrl}/relationships/accept/${userId}`, {});
    }

    /**
     * Reject an incoming friend request
     */
    rejectFriend(userId: number): Observable<any> {
        return this.http.put(`${this.apiUrl}/relationships/reject/${userId}`, {});
    }

    /**
     * Remove a friend
     */
    removeFriend(userId: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/relationships/${userId}`);
    }
}
