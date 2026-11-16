import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { firstValueFrom, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountDeletionService, FRESH_AUTH_MS } from './account-deletion.service';
import { AuthService, REPLACE_PAGE } from '../core/auth/auth.service';
import { LoggerService } from '../core/logging/logger.service';
import { PushService } from './push.service';
import { UserService } from './user.service';

describe('AccountDeletionService', () => {
  const NOW = new Date('2026-10-15T14:00:00Z').getTime();
  const camille = { id: 'b-camille', userName: 'camille' };
  let service: AccountDeletionService;
  let users: { getDeletionEligibility: ReturnType<typeof vi.fn>; deleteAccount: ReturnType<typeof vi.fn> };
  let push: { disable: ReturnType<typeof vi.fn>; clearShownNotifications: ReturnType<typeof vi.fn> };
  let auth0: { loginWithRedirect: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn> };
  let logger: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let replacePage: ReturnType<typeof vi.fn>;

  const refusal = (status: number, code?: string) =>
    throwError(() => new HttpErrorResponse({ status, error: code ? { code } : null }));
  /** The sign-in time the access token carries, in milliseconds. */
  const signedInAt = (authenticatedAtMs: number | null) =>
    vi.spyOn(TestBed.inject(AuthService), 'authenticatedAt').mockReturnValue(authenticatedAtMs);
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    users = { getDeletionEligibility: vi.fn(() => of({ allowed: true })), deleteAccount: vi.fn(() => of(null)) };
    push = { disable: vi.fn().mockResolvedValue(true), clearShownNotifications: vi.fn().mockResolvedValue(undefined) };
    auth0 = { loginWithRedirect: vi.fn(() => of(undefined)), logout: vi.fn(() => of(undefined)) };
    logger = { warn: vi.fn(), error: vi.fn() };
    replacePage = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: UserService, useValue: users },
        { provide: PushService, useValue: push },
        { provide: Auth0Service, useValue: auth0 },
        { provide: LoggerService, useValue: logger },
        { provide: REPLACE_PAGE, useValue: replacePage }
      ]
    });
    service = TestBed.inject(AccountDeletionService);
    signedInAt(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('eligibility', () => {
    it('eligibility_shouldAnswerWhetherDeletionIsAllowed', async () => {
      expect(await firstValueFrom(service.eligibility())).toBe(true);

      users.getDeletionEligibility.mockReturnValue(of({ allowed: false }));
      expect(await firstValueFrom(service.eligibility())).toBe(false);
    });

    it('eligibility_shouldPropagateTheError_whenTheServerFails', async () => {
      users.getDeletionEligibility.mockReturnValue(refusal(503));

      await expect(firstValueFrom(service.eligibility())).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('authenticationIsFresh', () => {
    it('authenticationIsFresh_shouldBeTrue_whenTheTokenWasSignedInJustNow', () => {
      signedInAt(NOW);

      expect(service.authenticationIsFresh()).toBe(true);
    });

    it('authenticationIsFresh_shouldBeFalse_pastTheWindow', () => {
      signedInAt(NOW - FRESH_AUTH_MS);

      expect(service.authenticationIsFresh()).toBe(false);
    });

    it('authenticationIsFresh_shouldBeFalse_whenTheTokenCarriesNoSignInTime', () => {
      // No proof of a recent sign-in is not proof of one: fail closed and ask again.
      signedInAt(null);

      expect(service.authenticationIsFresh()).toBe(false);
    });
  });

  describe('reauthenticate', () => {
    it('reauthenticate_shouldComeBackToPreferencesWithTheDeleteIntent', async () => {
      await service.reauthenticate();

      expect(auth0.loginWithRedirect).toHaveBeenCalledWith(expect.objectContaining({
        appState: { target: '/preferences?account=delete' },
        authorizationParams: expect.objectContaining({ prompt: 'login' })
      }));
    });

    it('reauthenticate_shouldPassTheUsernameAsLoginHint', async () => {
      await service.reauthenticate(camille.userName);

      expect(auth0.loginWithRedirect).toHaveBeenCalledWith(expect.objectContaining({
        authorizationParams: expect.objectContaining({ login_hint: 'camille' })
      }));
    });

    it('reauthenticate_shouldRememberNothing', async () => {
      // The point of the redesign: no state to lose, so coming back in another tab costs a click.
      await service.reauthenticate();

      expect(sessionStorage.length).toBe(0);
      expect(localStorage.length).toBe(0);
    });
  });

  describe('confirm', () => {
    it('confirm_shouldDisablePushAndClearTheTray_beforeSendingTheDelete', async () => {
      const order: string[] = [];
      push.disable.mockImplementation(async () => {
        order.push('push');
        return true;
      });
      push.clearShownNotifications.mockImplementation(async () => {
        order.push('tray');
      });
      users.deleteAccount.mockImplementation(() => {
        order.push('delete');
        return of(null);
      });

      await service.confirm();

      expect(order).toEqual(['push', 'tray', 'delete']);
    });

    it('confirm_shouldLeaveTheApp_whenTheServerAccepts', async () => {
      sessionStorage.setItem('wely.accountDeletion.requestedAt', '1');

      expect(await service.confirm()).toBe('deleted');

      expect(auth0.logout).toHaveBeenCalledWith({ openUrl: false });
      expect(replacePage).toHaveBeenCalledWith('/?account=deleted');
      expect(sessionStorage.getItem('wely.accountDeletion.requestedAt')).toBeNull();
    });

    it('confirm_shouldLeaveTheApp_whenTheAccountIsAlreadyGone', async () => {
      users.deleteAccount.mockReturnValue(refusal(410, 'USR-BUS-012'));

      expect(await service.confirm()).toBe('deleted');
      expect(replacePage).toHaveBeenCalledWith('/?account=deleted');
    });

    it('confirm_shouldStillDelete_whenPushCannotBeDisabled', async () => {
      push.disable.mockResolvedValue(false);

      expect(await service.confirm()).toBe('deleted');
      expect(users.deleteAccount).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('confirm_shouldAnswerReauthenticationRequired_whenTheServerAnswers010', async () => {
      users.deleteAccount.mockReturnValue(refusal(403, 'USR-BUS-010'));

      expect(await service.confirm()).toBe('reauthentication-required');
      expect(replacePage).not.toHaveBeenCalled();
    });

    it('confirm_shouldAnswerProtected_whenTheServerAnswers011', async () => {
      users.deleteAccount.mockReturnValue(refusal(403, 'USR-BUS-011'));

      expect(await service.confirm()).toBe('protected');
      expect(users.getDeletionEligibility).not.toHaveBeenCalled();
    });

    it('confirm_shouldReportUnavailable_whenDeletionIsSwitchedOff', async () => {
      users.deleteAccount.mockReturnValue(refusal(403, 'USR-BUS-014'));

      expect(await service.confirm()).toBe('unavailable');
      expect(users.getDeletionEligibility).not.toHaveBeenCalled();
    });

    it('confirm_shouldAnswerFailed_andNotLeave_onAnyOtherError', async () => {
      users.deleteAccount.mockReturnValue(refusal(500));

      expect(await service.confirm()).toBe('failed');
      expect(replacePage).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();

      users.deleteAccount.mockReturnValue(refusal(404, 'USR-BUS-001'));
      users.getDeletionEligibility.mockClear();
      expect(await service.confirm()).toBe('failed');
      expect(users.getDeletionEligibility).not.toHaveBeenCalled();
    });

    it('confirm_shouldLeave_whenTheDeleteFailsButTheAccountIsGone', async () => {
      // The gateway gave up after the commit: the 202 never arrived.
      users.deleteAccount.mockReturnValue(refusal(503));
      users.getDeletionEligibility.mockReturnValue(refusal(410, 'USR-BUS-012'));

      expect(await service.confirm()).toBe('deleted');
      expect(replacePage).toHaveBeenCalledWith('/?account=deleted');
    });

    it('confirm_shouldLeave_whenTheNetworkDroppedTheAnswer_andTheAccountIsGone', async () => {
      users.deleteAccount.mockReturnValue(refusal(0));
      users.getDeletionEligibility.mockReturnValue(refusal(410, 'USR-BUS-012'));

      expect(await service.confirm()).toBe('deleted');
    });

    it('confirm_shouldProbeBeforeAskingToReverify_afterAFailedAttempt', async () => {
      users.deleteAccount.mockReturnValueOnce(refusal(503)).mockReturnValueOnce(refusal(403, 'USR-BUS-010'));
      users.getDeletionEligibility.mockReturnValueOnce(of({ allowed: true }))
        .mockReturnValueOnce(refusal(410, 'USR-BUS-012'));

      expect(await service.confirm()).toBe('failed');
      expect(await service.confirm()).toBe('deleted');
      expect(users.getDeletionEligibility).toHaveBeenCalledTimes(2);
    });

    it('confirm_shouldAnswerFailed_whenTheProbeFailsToo', async () => {
      users.deleteAccount.mockReturnValue(refusal(503));
      users.getDeletionEligibility.mockReturnValue(refusal(503));

      expect(await service.confirm()).toBe('failed');
      expect(replacePage).not.toHaveBeenCalled();
    });
  });
});
