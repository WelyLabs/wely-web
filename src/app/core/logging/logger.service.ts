import { Injectable, isDevMode } from '@angular/core';

/**
 * Application logger, silent in production.
 *
 * <p>Replaces the 56 direct `console.*` calls the app had. One of them logged the
 * body of every incoming chat message, which put private conversations into the
 * browser console of whoever had devtools open.
 *
 * <p>`error` survives in production because a failure nobody can see is worse than a
 * noisy console; `debug` and `info` do not. Nothing here should ever be handed a
 * message body, a token, or anything else a user would not want printed.
 */
@Injectable({ providedIn: 'root' })
export class LoggerService {
  private readonly enabled = isDevMode();

  /** Verbose tracing: connection lifecycle, stream events. Development only. */
  debug(scope: string, message: string, ...details: unknown[]): void {
    if (this.enabled) {
      // eslint-disable-next-line no-console
      console.debug(`[${scope}] ${message}`, ...details);
    }
  }

  /** Notable but expected events. Development only. */
  info(scope: string, message: string, ...details: unknown[]): void {
    if (this.enabled) {
      // eslint-disable-next-line no-console
      console.info(`[${scope}] ${message}`, ...details);
    }
  }

  /** Something recoverable went wrong. Development only. */
  warn(scope: string, message: string, ...details: unknown[]): void {
    if (this.enabled) {
      // eslint-disable-next-line no-console
      console.warn(`[${scope}] ${message}`, ...details);
    }
  }

  /** A failure worth surfacing wherever the app runs. */
  error(scope: string, message: string, cause?: unknown): void {
    // eslint-disable-next-line no-console
    console.error(`[${scope}] ${message}`, cause ?? '');
  }
}
