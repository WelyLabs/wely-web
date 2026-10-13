import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { UserService } from './user.service';
import { KeycloakService } from 'keycloak-angular';
import { environment } from '../../environments/environment';
import { MOCK_USER } from '../models/user.mock';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { firstValueFrom } from 'rxjs';

describe('UserService', () => {
    let service: UserService;
    let httpMock: HttpTestingController;
    let keycloakMock: Partial<KeycloakService>;
    const apiUrl = `${environment.apiUrl}/user-service`;

    beforeEach(() => {
        TestBed.resetTestingModule();
        keycloakMock = {
            getKeycloakInstance: vi.fn().mockReturnValue({ token: 'mock-token' }),
            updateToken: vi.fn().mockResolvedValue(true)
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
        service['currentUserSubject'].next(MOCK_USER);
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
        service['currentUserSubject'].next(MOCK_USER);

        service.updateCurrentUser({ profilePicUrl: 'new.jpg' });

        expect(service.getCurrentUserValue()?.profilePicUrl).toBe('new.jpg');
        expect(service.getCurrentUserValue()?.userName).toBe(MOCK_USER.userName);
    });

    it('updateProfile_shouldSaveThenFollowTheStoredProfileAndRefreshTheToken', async () => {
        service['currentUserSubject'].next(MOCK_USER);
        const update = { userName: 'New_Name', firstName: 'New', lastName: 'User' };
        const saved = { ...MOCK_USER, userName: 'new_name', firstName: 'New', lastName: 'User' };

        const result = firstValueFrom(service.updateProfile(update));
        const req = httpMock.expectOne(`${apiUrl}/profile`);
        expect(req.request.method).toBe('PUT');
        expect(req.request.body).toEqual(update);
        req.flush(saved);

        await expect(result).resolves.toEqual(saved);
        expect(service.getCurrentUserValue()?.userName).toBe('new_name');
        // -1 forces a refresh: preferred_username is what wely-chat signs messages with.
        expect(keycloakMock.updateToken).toHaveBeenCalledWith(-1);
    });

    it('updateProfile_shouldStillSucceed_whenTheTokenRefreshFails', async () => {
        (keycloakMock.updateToken as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));
        const saved = { ...MOCK_USER, userName: 'new_name' };

        const result = firstValueFrom(service.updateProfile({ userName: 'new_name', firstName: 'A', lastName: 'B' }));
        httpMock.expectOne(`${apiUrl}/profile`).flush(saved);

        await expect(result).resolves.toEqual(saved);
    });

    it('should upload avatar', () => {
        const mockFile = new File([''], 'avatar.png', { type: 'image/png' });
        const mockUrl = 'http://avatar.com/new.jpg';

        service['currentUserSubject'].next(MOCK_USER);

        service.uploadAvatar(mockFile).subscribe();

        const req = httpMock.expectOne(`${apiUrl}/profile/picture`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body instanceof FormData).toBe(true);
        req.flush(mockUrl);

        expect(service.getCurrentUserValue()?.profilePicUrl).toBe(mockUrl);
    });
    it('should handle upload avatar failure', () => {
        const mockFile = new File([''], 'avatar.png', { type: 'image/png' });
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

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
        service['currentUserSubject'].next(null);
        service.updateCurrentUser({ profilePicUrl: 'new.jpg' });
        expect(service.getCurrentUserValue()).toBeNull();
    });
});
