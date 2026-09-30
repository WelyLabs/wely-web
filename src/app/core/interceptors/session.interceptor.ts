import { Injectable, inject } from '@angular/core';
import { LoggerService } from '../logging/logger.service';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class SessionInterceptor implements HttpInterceptor {
    private readonly logger = inject(LoggerService);
    private authService = inject(AuthService);


    intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
        return next.handle(request).pipe(
            catchError((error: HttpErrorResponse) => {
                const isUnauthorized = error.status === 401;
                const isInvalidGrant = error.status === 400 &&
                    (error.error?.error === 'invalid_grant' ||
                        error.error?.error_description?.includes('Token is not active'));

                // Si l'erreur est 401 ou 400 avec invalid_grant (token expiré ou révoqué)
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
