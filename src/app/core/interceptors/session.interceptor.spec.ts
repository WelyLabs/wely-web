import { TestBed } from '@angular/core/testing';
import { HttpRequest, HttpErrorResponse } from '@angular/common/http';
import { SessionInterceptor } from './session.interceptor';
import { AuthService } from '../auth/auth.service';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('SessionInterceptor', () => {
    let interceptor: SessionInterceptor;
    let authServiceMock: any;
    let nextMock: any;

    beforeEach(() => {
        authServiceMock = {
            login: vi.fn()
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
});
