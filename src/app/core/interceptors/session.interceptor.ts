import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, from, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { KeycloakService } from 'keycloak-angular';

@Injectable()
export class SessionInterceptor implements HttpInterceptor {
    constructor(private keycloak: KeycloakService) { }

    intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        return next.handle(request).pipe(
            catchError((error: HttpErrorResponse) => {
                const isUnauthorized = error.status === 401;
                const isInvalidGrant = error.status === 400 &&
                    (error.error?.error === 'invalid_grant' ||
                        error.error?.error_description?.includes('Token is not active'));

                // Si l'erreur est 401 ou 400 avec invalid_grant
                if (isUnauthorized || isInvalidGrant) {
                    console.warn(`[SessionInterceptor] Session issue detected (${error.status}). Attempting recovery...`);

                    return of(this.keycloak.isLoggedIn()).pipe(
                        switchMap(isLoggedIn => {
                            if (!isLoggedIn || isInvalidGrant) {
                                console.error('[SessionInterceptor] User not logged in or invalid grant. Redirecting to login.');
                                this.keycloak.login();
                                return throwError(() => error);
                            } else {
                                // On tente de rafraîchir le token
                                return from(this.keycloak.updateToken(20)).pipe(
                                    switchMap(() => {
                                        console.log('[SessionInterceptor] Token refreshed successfully. Retrying request.');
                                        return next.handle(request);
                                    }),
                                    catchError((refreshError) => {
                                        console.error('[SessionInterceptor] Token refresh failed. Redirecting to login.', refreshError);
                                        this.keycloak.login();
                                        return throwError(() => refreshError);
                                    })
                                );
                            }
                        })
                    );
                }
                return throwError(() => error);
            })
        );
    }
}
