import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable, catchError, map, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoggerService } from '../core/logging/logger.service';

/** The theme a user picks: always light, always dark, or as their device is set. */
export type ThemePreference = 'LIGHT' | 'DARK' | 'SYSTEM';

/** The look on screen once SYSTEM is resolved. */
export type AppliedTheme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['LIGHT', 'DARK', 'SYSTEM'];

/**
 * The last theme chosen on this browser. index.html reads it before Angular starts, so a dark
 * page does not flash white on load; keep the two in step.
 */
export const THEME_STORAGE_KEY = 'wely.theme';

/** The browser bar's colour, the page's background under each theme (--bg-canvas). */
const BAR_COLORS: Record<AppliedTheme, string> = { light: '#fcfaf7', dark: '#121214' };

const DARK_QUERY = '(prefers-color-scheme: dark)';

function isPreference(value: unknown): value is ThemePreference {
    return THEME_PREFERENCES.includes(value as ThemePreference);
}

/** Storage can be missing or refused (private mode, blocked site data): the device decides then. */
function readStored(): ThemePreference {
    try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        return isPreference(stored) ? stored : 'SYSTEM';
    } catch {
        return 'SYSTEM';
    }
}

function writeStored(theme: ThemePreference): void {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        // Not remembered on this browser: the account still has it, read again at the next sign-in.
    }
}

/**
 * The app's theme, from the user's preferences.
 *
 * <p>The choice is kept with the account (wely-users' /profile/preferences), so it follows the
 * user from one device to another, and on this browser too, so the page starts in the right
 * theme before anyone is signed in. SYSTEM follows the device, and keeps following it when it
 * switches at nightfall.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
    private readonly http = inject(HttpClient);
    private readonly document = inject(DOCUMENT);
    private readonly logger = inject(LoggerService);
    private readonly url = `${environment.apiUrl}/user-service/profile/preferences`;

    private readonly darkQuery = this.document.defaultView?.matchMedia?.(DARK_QUERY) ?? null;
    private readonly deviceDark = signal(this.darkQuery?.matches ?? false);

    private readonly chosen = signal<ThemePreference>(readStored());
    /** What the user picked. */
    readonly preference = this.chosen.asReadonly();
    /** What the page shows. */
    readonly applied = computed<AppliedTheme>(() => {
        const preference = this.chosen();
        if (preference === 'SYSTEM') {
            return this.deviceDark() ? 'dark' : 'light';
        }
        return preference === 'DARK' ? 'dark' : 'light';
    });

    constructor() {
        this.darkQuery?.addEventListener('change', event => this.deviceDark.set(event.matches));
        effect(() => this.apply(this.applied()));
    }

    /** Takes up the theme kept with the account; this browser's stays when it cannot be read. */
    sync(): void {
        this.http.get<{ theme: unknown }>(this.url).subscribe({
            next: ({ theme }) => {
                if (isPreference(theme)) {
                    this.use(theme);
                }
            },
            error: (error: unknown) => this.logger.warn('ThemeService', 'Theme preference not read:', error)
        });
    }

    /**
     * Applies the theme at once, then keeps it with the account. A refused save puts the
     * previous theme back, and fails for the caller to say so.
     */
    choose(theme: ThemePreference): Observable<ThemePreference> {
        const previous = this.chosen();
        this.use(theme);
        return this.http.put<{ theme: ThemePreference }>(this.url, { theme }).pipe(
            map(saved => isPreference(saved?.theme) ? saved.theme : theme),
            tap(saved => this.use(saved)),
            catchError((error: unknown) => {
                this.use(previous);
                return throwError(() => error);
            })
        );
    }

    private use(theme: ThemePreference): void {
        this.chosen.set(theme);
        writeStored(theme);
    }

    private apply(theme: AppliedTheme): void {
        const root = this.document.documentElement;
        root.dataset['theme'] = theme;
        root.style.colorScheme = theme;
        this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLORS[theme]);
    }
}
