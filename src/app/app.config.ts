import { ApplicationConfig, APP_INITIALIZER, LOCALE_ID, provideZonelessChangeDetection } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { provideRouter, withNavigationErrorHandler } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { KeycloakService, KeycloakBearerInterceptor } from 'keycloak-angular';
import { SessionInterceptor } from './core/interceptors/session.interceptor';
import { UserService } from './services/user.service';

import { routes } from './app.routes';
import { initializeKeycloak } from './core/auth/keycloak-init.factory';
import { AuthService } from './core/auth/auth.service';
import { LoggerService } from './core/logging/logger.service';
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
    KeycloakService,
    UserService,
    {
      provide: APP_INITIALIZER,
      useFactory: initializeKeycloak,
      multi: true,
      deps: [KeycloakService, UserService, AuthService, LoggerService]
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: KeycloakBearerInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: SessionInterceptor,
      multi: true
    }
  ]
};
