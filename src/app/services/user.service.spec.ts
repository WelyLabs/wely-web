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

    it('uploadAvatar_shouldPostTheFileAsMultipartAndAnswerTheSignedUrl', async () => {
        const file = new File(['jpeg'], 'avatar.jpg', { type: 'image/jpeg' });

        const result = firstValueFrom(service.uploadAvatar(file));
        const req = httpMock.expectOne(`${apiUrl}/profile/picture`);
        expect(req.request.method).toBe('POST');
        expect((req.request.body as FormData).get('file')).toBeInstanceOf(File);
        req.flush({ profilePicUrl: 'https://media/signed' });

        await expect(result).resolves.toEqual({ profilePicUrl: 'https://media/signed' });
    });

    it('uploadAvatar_shouldReportTheFailure', async () => {
        const result = firstValueFrom(service.uploadAvatar(new File(['x'], 'a.jpg')));
        httpMock.expectOne(`${apiUrl}/profile/picture`)
            .flush({ code: 'USR-BUS-006' }, { status: 400, statusText: 'Bad Request' });

        await expect(result).rejects.toMatchObject({ status: 400, error: { code: 'USR-BUS-006' } });
    });

    it('should NOT update current user locally if NO user is currently loaded', () => {
        service['currentUserSubject'].next(null);
        service.updateCurrentUser({ profilePicUrl: 'new.jpg' });
        expect(service.getCurrentUserValue()).toBeNull();
    });

    it('getAbout_shouldReadThePresentation', () => {
        let about: unknown = null;
        service.getAbout().subscribe(value => about = value);

        httpMock.expectOne(`${apiUrl}/profile/about`).flush({ bio: 'Partante', interests: ['Rando'] });

        expect(about).toEqual({ bio: 'Partante', interests: ['Rando'] });
    });

    it('updateAbout_shouldPutThePresentation', () => {
        service.updateAbout({ bio: null, interests: ['Ciné'] }).subscribe();

        const call = httpMock.expectOne(`${apiUrl}/profile/about`);
        expect(call.request.method).toBe('PUT');
        expect(call.request.body).toEqual({ bio: null, interests: ['Ciné'] });
        call.flush({ bio: null, interests: ['Ciné'] });
    });

    it('getFriendProfile_shouldReadTheFriendsProfile', () => {
        let profile: unknown = null;
        service.getFriendProfile('lea').subscribe(value => profile = value);

        const body = { id: 'lea', userName: 'lea', hashtag: 6000, firstName: 'Léa', lastName: 'Martin',
            joinedDate: '2026-01-15T10:30:00', bio: null, interests: [] };
        httpMock.expectOne(`${apiUrl}/users/lea/profile`).flush(body);

        expect(profile).toEqual(body);
    });

    it('getFriendProfile_shouldReportA403_whenNotFriends', () => {
        let status = 0;
        service.getFriendProfile('bob').subscribe({ error: error => status = error.status });

        httpMock.expectOne(`${apiUrl}/users/bob/profile`).flush({ code: 'USR-BUS-009' }, { status: 403, statusText: 'Forbidden' });

        expect(status).toBe(403);
    });

    it('getDeletionEligibility_shouldReadWhetherTheAccountMayBeDeleted', async () => {
        const result = firstValueFrom(service.getDeletionEligibility());

        const call = httpMock.expectOne(`${apiUrl}/profile/deletion`);
        expect(call.request.method).toBe('GET');
        call.flush({ allowed: false });

        expect(await result).toEqual({ allowed: false });
    });

    it('getDeletionEligibility_shouldReportTheFailure', async () => {
        const result = firstValueFrom(service.getDeletionEligibility());

        httpMock.expectOne(`${apiUrl}/profile/deletion`).flush(null, { status: 503, statusText: 'Unavailable' });

        await expect(result).rejects.toMatchObject({ status: 503 });
    });

    it('deleteAccount_shouldSendDeleteToTheProfile', async () => {
        const result = firstValueFrom(service.deleteAccount(), { defaultValue: undefined });

        const call = httpMock.expectOne(`${apiUrl}/profile`);
        expect(call.request.method).toBe('DELETE');
        call.flush(null, { status: 202, statusText: 'Accepted' });

        await expect(result).resolves.toBeNull();
    });

    it('deleteAccount_shouldReportA403WithItsCode', async () => {
        const result = firstValueFrom(service.deleteAccount());

        httpMock.expectOne(`${apiUrl}/profile`).flush({ code: 'USR-BUS-010' }, { status: 403, statusText: 'Forbidden' });

        await expect(result).rejects.toMatchObject({ status: 403, error: { code: 'USR-BUS-010' } });
    });
});
