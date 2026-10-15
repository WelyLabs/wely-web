import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Community,
  CommunityInvitation,
  CommunityLeaveResult,
  CommunityMember,
  CommunityRequest,
  CommunityRole,
} from '../models/community.model';

/** Communities, their members and invitations, from wely-social. Their events go through EventService. */
@Injectable({ providedIn: 'root' })
export class CommunityService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/social-service/communities`;

  /** Public communities, most members first; `query` searches name and description. */
  discover(query?: string, interest?: string): Observable<Community[]> {
    let params = new HttpParams();
    if (query?.trim()) {
      params = params.set('q', query.trim());
    }
    if (interest) {
      params = params.set('interest', interest);
    }
    return this.http.get<Community[]>(this.apiUrl, { params });
  }

  mine(): Observable<Community[]> {
    return this.http.get<Community[]>(`${this.apiUrl}/mine`);
  }

  get(communityId: string): Observable<Community> {
    return this.http.get<Community>(`${this.apiUrl}/${communityId}`);
  }

  create(request: CommunityRequest): Observable<Community> {
    return this.http.post<Community>(this.apiUrl, request);
  }

  update(communityId: string, request: CommunityRequest): Observable<Community> {
    return this.http.put<Community>(`${this.apiUrl}/${communityId}`, request);
  }

  delete(communityId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${communityId}`);
  }

  join(communityId: string): Observable<Community> {
    return this.http.post<Community>(`${this.apiUrl}/${communityId}/join`, {});
  }

  /** `deleteIfLast` confirms that leaving as the only member deletes the community. */
  leave(communityId: string, deleteIfLast = false): Observable<CommunityLeaveResult> {
    return this.http.post<CommunityLeaveResult>(`${this.apiUrl}/${communityId}/leave`, { deleteIfLast });
  }

  members(communityId: string): Observable<CommunityMember[]> {
    return this.http.get<CommunityMember[]>(`${this.apiUrl}/${communityId}/members`);
  }

  changeRole(communityId: string, memberId: string, role: CommunityRole): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/${communityId}/members/${memberId}/role`, { role });
  }

  removeMember(communityId: string, memberId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${communityId}/members/${memberId}`);
  }

  invite(communityId: string, inviteeId: string): Observable<CommunityInvitation> {
    return this.http.post<CommunityInvitation>(`${this.apiUrl}/${communityId}/invitations`, { inviteeId });
  }

  invitations(communityId: string): Observable<CommunityInvitation[]> {
    return this.http.get<CommunityInvitation[]>(`${this.apiUrl}/${communityId}/invitations`);
  }

  revoke(communityId: string, token: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${communityId}/invitations/${token}`);
  }

  /** For the person invited only; an expired one still reads, with `expired`. */
  invitation(token: string): Observable<CommunityInvitation> {
    return this.http.get<CommunityInvitation>(`${this.apiUrl}/invitations/${token}`);
  }

  accept(token: string): Observable<Community> {
    return this.http.post<Community>(`${this.apiUrl}/invitations/${token}/accept`, {});
  }
}
