import { Injectable, inject } from '@angular/core';
import { LoggerService } from '../logging/logger.service';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
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
            catchError((error: HttpErrorResponse) => {
                if (this.authService.sessionEnded()) {
                    return throwError(() => error);
                }
                if (isOwnAccountGone(request, error)) {
                    this.authService.leaveAfterAccountDeletion();
                    return throwError(() => error);
                }
                const isUnauthorized = error.status === 401;
                const isInvalidGrant = error.status === 400 &&
                    (error.error?.error === 'invalid_grant' ||
                        error.error?.error_description?.includes('Token is not active'));

                // A 401, or a 400 invalid_grant: the token expired or was revoked.
                if (isUnauthorized || isInvalidGrant) {
                    this.logger.error('SessionInterceptor', `[SessionInterceptor] Session issue detected (${error.status}). Redirecting to login.`);
                    this.authService.login();
                    return throwError(() => error);
                }
                return throwError(() => error);
            })
        );
    }
}
