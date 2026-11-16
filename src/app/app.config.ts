import { ApplicationConfig, LOCALE_ID, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { provideRouter, withNavigationErrorHandler } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthHttpInterceptor, provideAuth0 } from '@auth0/auth0-angular';
import { SessionInterceptor } from './core/interceptors/session.interceptor';
import { UserService } from './services/user.service';

import { routes } from './app.routes';
import { auth0Config, initializeAuth } from './core/auth/auth-init.factory';
import { handleStaleChunk } from './core/routing/stale-chunk';

// French dates everywhere: without a locale, every date pipe printed English day and month names.
registerLocaleData(localeFr);

export const appConfig: ApplicationConfig = {
  providers: [
    // Zoneless: every component is OnPush and keeps its state in signals, so change detection
    // runs when a signal or a bound event says so, not after every timer, request and pointer
    // move in the page. zone.js (35 KB) is no longer loaded.
    provideZonelessChangeDetection(),
    { provide: LOCALE_ID, useValue: 'fr-FR' },
    // A tab opened before a deploy asks for chunks the new image no longer has: reload it once,
    // on the screen it was going to. See stale-chunk.ts.
    provideRouter(routes, withNavigationErrorHandler(handleStaleChunk)),
    // Async: the animation engine (about 60 KB) loads with the first animated component
    // instead of delaying the first paint.
    provideAnimationsAsync(),
    provideHttpClient(withInterceptorsFromDi()),
    provideAuth0(auth0Config()),
    UserService,
    provideAppInitializer(initializeAuth),
    // First, so it also sees the token errors raised by the Auth0 interceptor behind it.
    {
      provide: HTTP_INTERCEPTORS,
      useClass: SessionInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthHttpInterceptor,
      multi: true
    }
  ]
};
