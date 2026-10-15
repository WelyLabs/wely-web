import { TestBed } from '@angular/core/testing';
import { HttpRequest, HttpErrorResponse } from '@angular/common/http';
import { SessionInterceptor, isOwnAccountGone } from './session.interceptor';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('SessionInterceptor', () => {
    let interceptor: SessionInterceptor;
    let authServiceMock: any;
    let nextMock: any;

    beforeEach(() => {
        authServiceMock = {
            login: vi.fn(),
            sessionEnded: signal(false),
            leaveAfterAccountDeletion: vi.fn()
        };
        nextMock = {
            handle: vi.fn()
        };

        TestBed.configureTestingModule({
            providers: [
                SessionInterceptor,
                { provide: AuthService, useValue: authServiceMock }
            ]
        });

        interceptor = TestBed.inject(SessionInterceptor);
    });

    it('should be created', () => {
        expect(interceptor).toBeTruthy();
    });

    it('should pass through normal requests', () => {
        const req = new HttpRequest('GET', '/test');
        nextMock.handle.mockReturnValue(of({}));

        interceptor.intercept(req, nextMock).subscribe();

        expect(nextMock.handle).toHaveBeenCalledWith(req);
    });

    it('should attempt recovery on 401 and redirect to login', () => {
        const req = new HttpRequest('GET', '/test');
        const errorResponse = new HttpErrorResponse({ status: 401 });

        nextMock.handle.mockReturnValue(throwError(() => errorResponse));

        interceptor.intercept(req, nextMock).subscribe({
            error: (err) => {
                expect(err.status).toBe(401);
                expect(authServiceMock.login).toHaveBeenCalled();
            }
        });
    });

    it('should handle 400 invalid_grant and redirect to login', () => {
        const req = new HttpRequest('GET', '/test');
        const errorResponse = new HttpErrorResponse({
            status: 400,
            error: { error: 'invalid_grant' }
        });

        nextMock.handle.mockReturnValue(throwError(() => errorResponse));

        interceptor.intercept(req, nextMock).subscribe({
            error: () => {
                expect(authServiceMock.login).toHaveBeenCalled();
            }
        });
    });

    it('should handle 400 with Token is not active description', () => {
        const req = new HttpRequest('GET', '/test');
        const errorResponse = new HttpErrorResponse({
            status: 400,
            error: { error_description: 'Token is not active' }
        });

        nextMock.handle.mockReturnValue(throwError(() => errorResponse));

        interceptor.intercept(req, nextMock).subscribe({
            error: () => {
                expect(authServiceMock.login).toHaveBeenCalled();
            }
        });
    });

    it('should rethrow non-auth errors', () => {
        const req = new HttpRequest('GET', '/test');
        const errorResponse = new HttpErrorResponse({ status: 500 });
        nextMock.handle.mockReturnValue(throwError(() => errorResponse));

        interceptor.intercept(req, nextMock).subscribe({
            error: (err) => {
                expect(err.status).toBe(500);
                expect(authServiceMock.login).not.toHaveBeenCalled();
            }
        });
    });

    describe('deleted account', () => {
        const users = `${environment.apiUrl}/user-service`;
        const gone = new HttpErrorResponse({ status: 410, error: { code: 'USR-BUS-012' } });

        it('intercept_shouldNotRedirectToLogin_whenTheSessionHasEnded', () => {
            authServiceMock.sessionEnded.set(true);
            nextMock.handle.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
            let failure: HttpErrorResponse | undefined;

            interceptor.intercept(new HttpRequest('GET', `${users}/profile`), nextMock).subscribe({ error: err => failure = err });

            expect(failure?.status).toBe(401);
            expect(authServiceMock.login).not.toHaveBeenCalled();
            expect(authServiceMock.leaveAfterAccountDeletion).not.toHaveBeenCalled();
        });

        it('intercept_shouldLeaveTheApp_whenTheOwnAccountIsGone', () => {
            nextMock.handle.mockReturnValue(throwError(() => gone));
            let failure: HttpErrorResponse | undefined;

            interceptor.intercept(new HttpRequest('GET', `${users}/profile`), nextMock).subscribe({ error: err => failure = err });

            expect(failure).toBe(gone);
            expect(authServiceMock.leaveAfterAccountDeletion).toHaveBeenCalledTimes(1);
            expect(authServiceMock.login).not.toHaveBeenCalled();
        });

        it('intercept_shouldNotLeave_whenAFriendsProfileIsGone', () => {
            nextMock.handle.mockReturnValue(throwError(() => gone));

            interceptor.intercept(new HttpRequest('GET', `${users}/users/u2/profile`), nextMock).subscribe({ error: () => undefined });

            expect(authServiceMock.leaveAfterAccountDeletion).not.toHaveBeenCalled();
        });

        it('isOwnAccountGone_shouldMatchOnlyTheOwnProfileEndpoints_with410AndUsrBus012', () => {
            const request = (url: string) => new HttpRequest('GET', url);

            expect(isOwnAccountGone(request(`${users}/profile`), gone)).toBe(true);
            expect(isOwnAccountGone(request(`${users}/profile/about`), gone)).toBe(true);
            expect(isOwnAccountGone(request(`${users}/profile?x=1`), gone)).toBe(true);
            expect(isOwnAccountGone(request(`${users}/profileX`), gone)).toBe(false);
            expect(isOwnAccountGone(request(`${users}/users/u2/profile`), gone)).toBe(false);
            expect(isOwnAccountGone(request(`${users}/profile`), new HttpErrorResponse({ status: 410, error: { code: 'EVT-BUS-025' } })))
                .toBe(false);
            expect(isOwnAccountGone(request(`${users}/profile`), new HttpErrorResponse({ status: 404, error: { code: 'USR-BUS-012' } })))
                .toBe(false);
        });
    });
});
