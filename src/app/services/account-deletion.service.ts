import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, map } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { LoggerService } from '../core/logging/logger.service';
import {
  ACCOUNT_DELETE_INTENT, ACCOUNT_DELETION_DISABLED_CODE, ACCOUNT_PROTECTED_CODE, ACCOUNT_QUERY_PARAM,
  REAUTHENTICATION_REQUIRED_CODE, USER_DELETED_CODE
} from '../models/account.model';
import { PushService } from './push.service';
import { UserService } from './user.service';

const SCOPE = 'AccountDeletionService';

/**
 * A sign-in older than this no longer confirms a deletion. wely-users refuses past thirty minutes;
 * the minute of margin keeps this device from sending a request the server is about to reject.
 */
export const FRESH_AUTH_MS = 29 * 60_000;

const GONE = 410;
const FORBIDDEN = 403;

/** How the final deletion request ended. */
export type DeletionOutcome = 'deleted' | 'reauthentication-required' | 'protected' | 'unavailable' | 'failed';

function codeOf(error: unknown): string | undefined {
  return error instanceof HttpErrorResponse ? (error.error as { code?: string } | null)?.code : undefined;
}

/** A 410 USR-BUS-012: the account is already deleted. */
function isAccountGone(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === GONE && codeOf(error) === USER_DELETED_CODE;
}

/** A failure after which the deletion may have been committed all the same. */
function mayHaveCompleted(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse)) {
    return false;
  }
  return error.status === 0 || error.status >= 500 || codeOf(error) === REAUTHENTICATION_REQUIRED_CODE;
}

/** The deletion is scheduled this far ahead; wely-users owns the real delay, this only words it. */
export const GRACE_PERIOD_DAYS = 30;

/**
 * The account deletion flow: the request, the forced re-authentication, and the DELETE that
 * schedules the erasure, after which this device leaves the app for the landing page. The deletion
 * runs thirty days later, and any sign-in before then cancels it.
 */
@Injectable({ providedIn: 'root' })
export class AccountDeletionService {
  private readonly userService = inject(UserService);
  private readonly authService = inject(AuthService);
  private readonly push = inject(PushService);
  private readonly logger = inject(LoggerService);

  /** Whether wely-users lets this account be deleted. */
  eligibility(): Observable<boolean> {
    return this.userService.getDeletionEligibility().pipe(map(eligibility => eligibility.allowed === true));
  }

  /**
   * Cancels a deletion scheduled for this account, as signing in is meant to. No screen asks:
   * being here is the answer, and the caller tells the user afterwards.
   *
   * @returns the due date of the deletion just cancelled, or null when there was none.
   */
  async cancelScheduledDeletion(): Promise<Date | null> {
    try {
      const { dueAt } = await firstValueFrom(this.userService.getDeletionEligibility());
      if (!dueAt) {
        return null;
      }
      await firstValueFrom(this.userService.cancelAccountDeletion());
      return new Date(dueAt);
    } catch (error) {
      // Deletion switched off, account already erased, server down: nothing this device can undo.
      this.logger.debug(SCOPE, 'No scheduled deletion to cancel', error);
      return null;
    }
  }

  /**
   * Whether the sign-in behind the current token is recent enough to confirm a deletion.
   * Absent claim counts as stale: without proof of a recent sign-in, ask for one.
   */
  authenticationIsFresh(): boolean {
    const authenticatedAt = this.authService.authenticatedAt();
    return authenticatedAt !== null && Date.now() - authenticatedAt < FRESH_AUTH_MS;
  }

  /**
   * Forces a sign-in and comes back to the account section.
   *
   * THIS HAPPENS BEFORE ANYTHING IS CONFIRMED, on purpose. With the round trip behind us, the
   * confirmation and the DELETE both happen in one page, so nothing has to survive a redirect the
   * app does not control — the previous order kept the intent in sessionStorage, and a user who
   * came back through a password-reset link landed in another tab with it gone.
   */
  async reauthenticate(loginHint?: string): Promise<void> {
    await this.authService.reauthenticate(
      `/preferences?${ACCOUNT_QUERY_PARAM}=${ACCOUNT_DELETE_INTENT}`, loginHint);
  }

  /** Unsubscribes push and clears the tray while the identity is valid, then deletes the account. */
  async confirm(): Promise<DeletionOutcome> {
    if (!(await this.push.disable())) {
      this.logger.warn(SCOPE, 'Push could not be disabled on this device; wely-notifications drops the subscription');
    }
    await this.push.clearShownNotifications();
    try {
      await firstValueFrom(this.userService.deleteAccount());
      return this.leave();
    } catch (error) {
      return this.afterRefusal(error);
    }
  }

  private leave(): DeletionOutcome {
    this.authService.leaveAfterAccountDeletion();
    return 'deleted';
  }

  private async afterRefusal(error: unknown): Promise<DeletionOutcome> {
    if (isAccountGone(error)) {
      return this.leave();
    }
    const code = codeOf(error);
    if (error instanceof HttpErrorResponse && error.status === FORBIDDEN && code === ACCOUNT_PROTECTED_CODE) {
      return 'protected';
    }
    if (error instanceof HttpErrorResponse && error.status === FORBIDDEN && code === ACCOUNT_DELETION_DISABLED_CODE) {
      return 'unavailable';
    }
    // The 202 may have been lost after the commit: asking first avoids a re-authentication that cannot succeed.
    if (mayHaveCompleted(error) && await this.isAccountGone()) {
      return this.leave();
    }
    if (error instanceof HttpErrorResponse && error.status === FORBIDDEN && code === REAUTHENTICATION_REQUIRED_CODE) {
      return 'reauthentication-required';
    }
    this.logger.error(SCOPE, 'Could not delete the account', error);
    return 'failed';
  }

  private async isAccountGone(): Promise<boolean> {
    try {
      await firstValueFrom(this.userService.getDeletionEligibility());
      return false;
    } catch (error) {
      return isAccountGone(error);
    }
  }
}
