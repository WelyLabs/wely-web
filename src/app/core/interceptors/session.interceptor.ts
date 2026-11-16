import { Injectable, inject } from '@angular/core';
import { LoggerService } from '../logging/logger.service';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { GenericError } from '@auth0/auth0-angular';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';
import { USER_DELETED_CODE } from '../../models/account.model';

const GONE = 410;

/** A 410 USR-BUS-012 on the caller's own profile endpoints: their account was deleted, from this device or another. */
export function isOwnAccountGone(request: HttpRequest<unknown>, error: HttpErrorResponse): boolean {
    if (error.status !== GONE || (error.error as { code?: string } | null)?.code !== USER_DELETED_CODE) {
        return false;
    }
    const profile = `${environment.apiUrl}/user-service/profile`;
    return request.url === profile || request.url.startsWith(`${profile}/`) || request.url.startsWith(`${profile}?`);
}

@Injectable()
export class SessionInterceptor implements HttpInterceptor {
    private readonly logger = inject(LoggerService);
    private authService = inject(AuthService);

    /** Sends an expired session to the login, and a deleted account to the landing; never once the session has ended. */
    intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
        return next.handle(request).pipe(
            catchError((error: unknown) => {
                if (this.authService.sessionEnded()) {
                    return throwError(() => error);
                }
                if (error instanceof HttpErrorResponse && isOwnAccountGone(request, error)) {
                    this.authService.leaveAfterAccountDeletion();
                    return throwError(() => error);
                }
                const isUnauthorized = error instanceof HttpErrorResponse && error.status === 401;
                // Raised by the Auth0 interceptor: the refresh token expired or was revoked.
                const isInvalidGrant = error instanceof GenericError && error.error === 'invalid_grant';

                if (isUnauthorized || isInvalidGrant) {
                    this.logger.error('SessionInterceptor', `Session issue detected (${isUnauthorized ? 401 : 'invalid_grant'}). Redirecting to login.`);
                    this.authService.login();
                    return throwError(() => error);
                }
                return throwError(() => error);
            })
        );
    }
}
