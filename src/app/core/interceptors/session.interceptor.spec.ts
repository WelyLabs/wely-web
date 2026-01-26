import { TestBed } from '@angular/core/testing';
import { HttpRequest, HttpErrorResponse, HttpHandler } from '@angular/common/http';
import { SessionInterceptor } from './session.interceptor';
import { KeycloakService } from 'keycloak-angular';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('SessionInterceptor', () => {
    let interceptor: SessionInterceptor;
    let keycloakMock: any;
    let nextMock: any;

    beforeEach(() => {
        keycloakMock = {
            isLoggedIn: vi.fn(),
            login: vi.fn(),
            updateToken: vi.fn()
        };
        nextMock = {
            handle: vi.fn()
        };

        TestBed.configureTestingModule({
            providers: [
                SessionInterceptor,
                { provide: KeycloakService, useValue: keycloakMock }
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

    it('should attempt recovery on 401 and refresh token if logged in', async () => {
        const req = new HttpRequest('GET', '/test');
        const errorResponse = new HttpErrorResponse({ status: 401 });

        nextMock.handle.mockReturnValueOnce(throwError(() => errorResponse));
        keycloakMock.isLoggedIn.mockReturnValue(true);
        keycloakMock.updateToken.mockResolvedValue(true);
        nextMock.handle.mockReturnValueOnce(of({ success: true }));

        interceptor.intercept(req, nextMock).subscribe(res => {
            expect(keycloakMock.updateToken).toHaveBeenCalled();
            expect(nextMock.handle).toHaveBeenCalledTimes(2);
        });
    });

    it('should redirect to login on 401 if user is NOT logged in', async () => {
        const req = new HttpRequest('GET', '/test');
        const errorResponse = new HttpErrorResponse({ status: 401 });

        nextMock.handle.mockReturnValueOnce(throwError(() => errorResponse));
        keycloakMock.isLoggedIn.mockReturnValue(false);

        interceptor.intercept(req, nextMock).subscribe({
            error: () => {
                expect(keycloakMock.login).toHaveBeenCalled();
            }
        });
    });
});
