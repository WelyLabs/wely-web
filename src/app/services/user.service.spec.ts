import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { UserService } from './user.service';
import { KeycloakService } from 'keycloak-angular';
import { environment } from '../../environments/environment';
import { User } from '../models/user.model';
import { MOCK_USER } from '../models/user.mock';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of } from 'rxjs';

describe('UserService', () => {
    let service: UserService;
    let httpMock: HttpTestingController;
    let keycloakMock: any;
    const apiUrl = `${environment.apiUrl}/user-service`;

    beforeEach(() => {
        keycloakMock = {
            getKeycloakInstance: vi.fn().mockReturnValue({ token: 'mock-token' })
        };

        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [
                UserService,
                { provide: KeycloakService, useValue: keycloakMock }
            ]
        });
        service = TestBed.inject(UserService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('should get current user value', () => {
        (service as any).currentUserSubject.next(MOCK_USER);
        expect(service.getCurrentUserValue()).toEqual(MOCK_USER);
    });

    it('should get access token', () => {
        expect(service.getAccessToken()).toBe('mock-token');
    });

    it('should load and set current user', () => {
        service.loadAndSetCurrentUser().subscribe(user => {
            expect(user).toEqual(MOCK_USER);
            expect(service.getCurrentUserValue()).toEqual(MOCK_USER);
        });

        const req = httpMock.expectOne(`${apiUrl}/profile`);
        req.flush(MOCK_USER);
    });

    it('should update current user locally', () => {
        (service as any).currentUserSubject.next(MOCK_USER);

        service.updateCurrentUser({ profilePicUrl: 'new.jpg' });

        expect(service.getCurrentUserValue()?.profilePicUrl).toBe('new.jpg');
        expect(service.getCurrentUserValue()?.userName).toBe(MOCK_USER.userName);
    });

    it('should update profile via API', () => {
        const updates = { username: 'new', firstName: 'New', lastName: 'User', email: 'new@test.com' };
        service.updateProfile(updates).subscribe();

        const req = httpMock.expectOne(`${apiUrl}/profile`);
        expect(req.request.method).toBe('PUT');
        expect(req.request.body).toEqual(updates);
        req.flush({});
    });

    it('should upload avatar', () => {
        const mockFile = new File([''], 'avatar.png', { type: 'image/png' });
        const mockUrl = 'http://avatar.com/new.jpg';

        (service as any).currentUserSubject.next(MOCK_USER);

        service.uploadAvatar(mockFile).subscribe(res => {
            // The service uses as unknown as Observable<{profilePicUrl: string}> but returns the string from post
        });

        const req = httpMock.expectOne(`${apiUrl}/profile/picture`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body instanceof FormData).toBe(true);
        req.flush(mockUrl);

        expect(service.getCurrentUserValue()?.profilePicUrl).toBe(mockUrl);
    });
    it('should handle upload avatar failure', () => {
        const mockFile = new File([''], 'avatar.png', { type: 'image/png' });
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        service.uploadAvatar(mockFile).subscribe({
            error: (err) => {
                expect(err).toBeDefined();
            }
        });

        const req = httpMock.expectOne(`${apiUrl}/profile/picture`);
        req.error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
        expect(consoleSpy).toHaveBeenCalled();
    });

    it('should NOT update current user locally if NO user is currently loaded', () => {
        (service as any).currentUserSubject.next(null);
        service.updateCurrentUser({ profilePicUrl: 'new.jpg' });
        expect(service.getCurrentUserValue()).toBeNull();
    });
});
