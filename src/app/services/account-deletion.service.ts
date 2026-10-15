import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, map } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { LoggerService } from '../core/logging/logger.service';
import { storageOrNull } from '../core/storage/web-storage';
import {
  ACCOUNT_DELETE_INTENT, ACCOUNT_DELETION_DISABLED_CODE, ACCOUNT_PROTECTED_CODE, ACCOUNT_QUERY_PARAM,
  REAUTHENTICATION_REQUIRED_CODE, USER_DELETED_CODE
} from '../models/account.model';
import { User } from '../models/user.model';
import { PushService } from './push.service';
import { UserService } from './user.service';

const SCOPE = 'AccountDeletionService';

/** When the deletion was asked for, in epoch ms on this device's clock. */
export const DELETION_REQUESTED_AT_KEY = 'wely.accountDeletion.requestedAt';
/** The businessId of the account the deletion was asked for. */
export const DELETION_USER_ID_KEY = 'wely.accountDeletion.userId';
/** A request older than this is forgotten. */
export const MARKER_TTL_MS = 10 * 60_000;
/** How much older than the request the sign-in may look before it is not trusted to be the re-authentication. */
export const AUTH_SKEW_MS = 60_000;

const GONE = 410;
const FORBIDDEN = 403;

/** Where a deletion asked for before the Keycloak round trip stands on return. */
export type PendingDeletionStep = 'confirm' | 'reverify';

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

/**
 * The account deletion flow: the request, the forced re-authentication, and the final DELETE,
 * after which this device leaves the app for the landing page.
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

  /** Remembers the request for this account, then forces a sign-in that comes back to the final step; false when storage is blocked. */
  async start(user: Pick<User, 'id' | 'userName'>): Promise<boolean> {
    const storage = storageOrNull('session');
    try {
      if (!storage) {
        return false;
      }
      storage.setItem(DELETION_REQUESTED_AT_KEY, String(Date.now()));
      storage.setItem(DELETION_USER_ID_KEY, user.id);
    } catch (error) {
      this.logger.warn(SCOPE, 'Could not remember the deletion request', error);
      return false;
    }
    const redirect = `${window.location.origin}/preferences?${ACCOUNT_QUERY_PARAM}=${ACCOUNT_DELETE_INTENT}`;
    await this.authService.reauthenticate(redirect, user.userName);
    return true;
  }

  /** The final step to show on /preferences, or null when no fresh request of this account is waiting. */
  pendingStep(userId: string, intent: string | null): PendingDeletionStep | null {
    if (intent !== ACCOUNT_DELETE_INTENT) {
      return null;
    }
    const storage = storageOrNull('session');
    let requestedAt: number;
    let owner: string | null;
    try {
      requestedAt = Number(storage?.getItem(DELETION_REQUESTED_AT_KEY) ?? NaN);
      owner = storage?.getItem(DELETION_USER_ID_KEY) ?? null;
    } catch {
      return null;
    }
    const fresh = Number.isFinite(requestedAt) && Date.now() - requestedAt <= MARKER_TTL_MS;
    if (!fresh || owner !== userId) {
      this.cancel();
      return null;
    }
    const authenticatedAt = this.authService.authenticatedAt();
    return authenticatedAt !== null && authenticatedAt < requestedAt - AUTH_SKEW_MS ? 'reverify' : 'confirm';
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

  /** Forgets the request. */
  cancel(): void {
    try {
      const storage = storageOrNull('session');
      storage?.removeItem(DELETION_REQUESTED_AT_KEY);
      storage?.removeItem(DELETION_USER_ID_KEY);
    } catch {
      // Storage refused: the request expires on its own.
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
      this.cancel();
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
