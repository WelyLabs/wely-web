import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, from } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class SessionInterceptor implements HttpInterceptor {
    constructor(private authService: AuthService) { }

    intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        return next.handle(request).pipe(
            catchError((error: HttpErrorResponse) => {
                const isUnauthorized = error.status === 401;
                const isInvalidGrant = error.status === 400 &&
                    (error.error?.error === 'invalid_grant' ||
                        error.error?.error_description?.includes('Token is not active'));

                // Si l'erreur est 401 ou 400 avec invalid_grant (token expiré ou révoqué)
                if (isUnauthorized || isInvalidGrant) {
                    console.error(`[SessionInterceptor] Session issue detected (${error.status}). Redirecting to login.`);
                    this.authService.login();
                    return throwError(() => error);
                }
                return throwError(() => error);
            })
        );
    }
}
