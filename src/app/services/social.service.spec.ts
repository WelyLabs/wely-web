import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SocialService } from './social.service';
import { environment } from '../../environments/environment';
import { UserWithStatusDTO } from '../models/user.model';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

    it('should accept friend request', () => {
        const userId = 123;
        service.acceptFriend(userId).subscribe();

        const req = httpMock.expectOne(`${apiUrl}/relationships/accept/${userId}`);
        expect(req.request.method).toBe('PUT');
        req.flush({});
    });

    it('should reject friend request', () => {
        const userId = 123;
        service.rejectFriend(userId).subscribe();

        const req = httpMock.expectOne(`${apiUrl}/relationships/reject/${userId}`);
        expect(req.request.method).toBe('PUT');
        req.flush({});
    });

    it('should remove friend', () => {
        const userId = 123;
        service.removeFriend(userId).subscribe();

        const req = httpMock.expectOne(`${apiUrl}/relationships/${userId}`);
        expect(req.request.method).toBe('DELETE');
        req.flush({});
    });
});
