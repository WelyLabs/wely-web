import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SocialService } from './social.service';
import { environment } from '../../environments/environment';
import { UserWithStatusDTO } from '../models/user.model';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('SocialService', () => {
    let service: SocialService;
    let httpMock: HttpTestingController;
    const apiUrl = `${environment.apiUrl}/social-service`;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [SocialService]
        });
        service = TestBed.inject(SocialService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('should search users without params', () => {
        const mockUsers: UserWithStatusDTO[] = [];
        service.searchUsers().subscribe(users => {
            expect(users).toEqual(mockUsers);
        });

        const req = httpMock.expectOne(`${apiUrl}/users`);
        expect(req.request.method).toBe('GET');
        req.flush(mockUsers);
    });

    it('should search users with relationStatus param', () => {
        const mockUsers: UserWithStatusDTO[] = [];
        const status = 'FRIENDS';
        service.searchUsers(status).subscribe(users => {
            expect(users).toEqual(mockUsers);
        });

        const req = httpMock.expectOne(req => req.url === `${apiUrl}/users` && req.params.get('friendshipStatus') === status);
        expect(req.request.method).toBe('GET');
        req.flush(mockUsers);
    });

    it('should list friends as user nodes', () => {
        const friends = [{ userId: 'u-1', userName: 'Alice', hashtag: 1234 }];
        let received: unknown;
        service.listFriends().subscribe(users => received = users);

        const req = httpMock.expectOne(req => req.url === `${apiUrl}/users` && req.params.get('friendshipStatus') === 'FRIENDS');
        expect(req.request.method).toBe('GET');
        req.flush(friends);
        expect(received).toEqual(friends);
    });

    it('should send friend request', () => {
        const tag = 'User#1234';
        service.sendFriendRequest(tag).subscribe(res => {
            expect(res).toBeDefined();
        });

        const req = httpMock.expectOne(`${apiUrl}/relationships/request`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ userTag: tag });
        req.flush({});
    });

    it('sendFriendRequest_shouldSayWhichEventTheTwoMetAt', () => {
        service.sendFriendRequest('Alice#1234', 'e1').subscribe();

        const req = httpMock.expectOne(`${apiUrl}/relationships/request`);
        expect(req.request.body).toEqual({ userTag: 'Alice#1234', viaEventId: 'e1' });
        req.flush({});
    });

    it('should accept friend request', () => {
        const userId = '550e8400-e29b-41d4-a716-446655440000';
        service.acceptFriend(userId).subscribe();

        const req = httpMock.expectOne(`${apiUrl}/relationships/accept/${userId}`);
        expect(req.request.method).toBe('PUT');
        req.flush({});
    });

    it('should reject friend request', () => {
        const userId = '550e8400-e29b-41d4-a716-446655440000';
        service.rejectFriend(userId).subscribe();

        const req = httpMock.expectOne(`${apiUrl}/relationships/reject/${userId}`);
        expect(req.request.method).toBe('PUT');
        req.flush({});
    });

    it('should remove friend', () => {
        const userId = '550e8400-e29b-41d4-a716-446655440000';
        service.removeFriend(userId).subscribe();

        const req = httpMock.expectOne(`${apiUrl}/relationships/${userId}`);
        expect(req.request.method).toBe('DELETE');
        req.flush({});
    });

    it('should list friendships', () => {
        const friendships = [{ userId: 'u-1', userName: 'Alice', hashtag: 1, closeness: 'CLOSE', proposal: null, proposedByFriend: false }];
        let received: unknown;
        service.listFriendships().subscribe(list => received = list);

        const req = httpMock.expectOne(`${apiUrl}/relationships`);
        expect(req.request.method).toBe('GET');
        req.flush(friendships);
        expect(received).toEqual(friendships);
    });

    it('should request a closeness level', () => {
        service.requestCloseness('u-1', 'INTIMATE').subscribe();

        const req = httpMock.expectOne(`${apiUrl}/relationships/u-1/closeness`);
        expect(req.request.method).toBe('PUT');
        expect(req.request.body).toEqual({ closeness: 'INTIMATE' });
        req.flush({});
    });

    it('should accept a proposed closeness', () => {
        service.acceptCloseness('u-1').subscribe();

        const req = httpMock.expectOne(`${apiUrl}/relationships/u-1/closeness/accept`);
        expect(req.request.method).toBe('PUT');
        req.flush({});
    });

    it('should decline a proposed closeness', () => {
        service.declineCloseness('u-1').subscribe();

        const req = httpMock.expectOne(`${apiUrl}/relationships/u-1/closeness/decline`);
        expect(req.request.method).toBe('PUT');
        req.flush({});
    });

    it('getPerson_shouldReadThePersonAndTheRelation', () => {
        let person: unknown = null;
        service.getPerson('lea').subscribe(value => person = value);

        const body = { userId: 'lea', userName: 'lea', hashtag: 6000, relationStatus: 'FRIENDS', closeness: 'CLOSE',
            proposal: null, proposedByFriend: false, since: '2026-10-14T00:54:32.123456789Z' };
        const call = httpMock.expectOne(`${apiUrl}/users/lea`);
        expect(call.request.method).toBe('GET');
        call.flush(body);

        expect(person).toEqual(body);
    });

    it('getMutualFriends_shouldReadTheFriendsInCommon', () => {
        let mutual: unknown = null;
        service.getMutualFriends('lea').subscribe(value => mutual = value);

        httpMock.expectOne(`${apiUrl}/users/lea/mutual`).flush([{ userId: 'hugo', userName: 'hugo', hashtag: 9074 }]);

        expect(mutual).toEqual([{ userId: 'hugo', userName: 'hugo', hashtag: 9074 }]);
    });
});
