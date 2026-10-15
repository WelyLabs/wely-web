import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { KeycloakService } from 'keycloak-angular';
import { firstValueFrom, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountDeletionService, DELETION_REQUESTED_AT_KEY, DELETION_USER_ID_KEY } from './account-deletion.service';
import { REPLACE_PAGE } from '../core/auth/auth.service';
import { LoggerService } from '../core/logging/logger.service';
import { PushService } from './push.service';
import { UserService } from './user.service';

describe('AccountDeletionService', () => {
  const NOW = new Date('2026-10-15T14:00:00Z').getTime();
  const camille = { id: 'b-camille', userName: 'camille' };
  let service: AccountDeletionService;
  let users: { getDeletionEligibility: ReturnType<typeof vi.fn>; deleteAccount: ReturnType<typeof vi.fn> };
  let push: { disable: ReturnType<typeof vi.fn>; clearShownNotifications: ReturnType<typeof vi.fn> };
  let keycloak: { login: ReturnType<typeof vi.fn>; clearToken: ReturnType<typeof vi.fn>; getKeycloakInstance: ReturnType<typeof vi.fn> };
  let logger: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let replacePage: ReturnType<typeof vi.fn>;

  const refusal = (status: number, code?: string) =>
    throwError(() => new HttpErrorResponse({ status, error: code ? { code } : null }));
  /** The token as Keycloak signed it: auth_time on Keycloak's clock, timeSkew the device's lead over it, in seconds. */
  const signedInAt = (authTimeMs: number | null, timeSkew = 0) => keycloak.getKeycloakInstance.mockReturnValue({
    tokenParsed: authTimeMs === null ? { exp: NOW / 1000 + 300 } : { auth_time: authTimeMs / 1000 },
    timeSkew
  });
  const remember = (requestedAt: number, userId = camille.id) => {
    sessionStorage.setItem(DELETION_REQUESTED_AT_KEY, String(requestedAt));
    sessionStorage.setItem(DELETION_USER_ID_KEY, userId);
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    users = { getDeletionEligibility: vi.fn(() => of({ allowed: true })), deleteAccount: vi.fn(() => of(null)) };
    push = { disable: vi.fn().mockResolvedValue(true), clearShownNotifications: vi.fn().mockResolvedValue(undefined) };
    keycloak = { login: vi.fn().mockResolvedValue(undefined), clearToken: vi.fn(), getKeycloakInstance: vi.fn() };
    logger = { warn: vi.fn(), error: vi.fn() };
    replacePage = vi.fn();
    signedInAt(NOW);
    TestBed.configureTestingModule({
      providers: [
        { provide: UserService, useValue: users },
        { provide: PushService, useValue: push },
        { provide: KeycloakService, useValue: keycloak },
        { provide: LoggerService, useValue: logger },
        { provide: REPLACE_PAGE, useValue: replacePage }
      ]
    });
    service = TestBed.inject(AccountDeletionService);
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

  describe('start', () => {
    it('start_shouldWriteTheMarker_thenReauthenticateBackToPreferencesWithTheDeleteIntent', async () => {
      expect(await service.start(camille)).toBe(true);

      expect(sessionStorage.getItem(DELETION_REQUESTED_AT_KEY)).toBe(String(NOW));
      expect(sessionStorage.getItem(DELETION_USER_ID_KEY)).toBe('b-camille');
      expect(keycloak.login).toHaveBeenCalledWith(expect.objectContaining({
        prompt: 'login', redirectUri: `${window.location.origin}/preferences?account=delete`
      }));
    });

    it('start_shouldPassTheUsernameAsLoginHint', async () => {
      await service.start(camille);

      expect(keycloak.login).toHaveBeenCalledWith(expect.objectContaining({ loginHint: 'camille' }));
    });

    it('start_shouldNotReauthenticate_whenTheMarkerCannotBeWritten', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });

      expect(await service.start(camille)).toBe(false);
      expect(keycloak.login).not.toHaveBeenCalled();
    });

    it('start_shouldNotReauthenticate_whenSessionStorageIsBlocked', async () => {
      vi.spyOn(globalThis, 'sessionStorage', 'get').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });

      expect(await service.start(camille)).toBe(false);
      expect(keycloak.login).not.toHaveBeenCalled();
    });
  });

  describe('pendingStep', () => {
    it('pendingStep_shouldBeConfirm_whenTheIntentAndAFreshMarkerOfThisUserArePresent', () => {
      remember(NOW - 60_000);
      signedInAt(NOW - 30_000);

      expect(service.pendingStep(camille.id, 'delete')).toBe('confirm');
      expect(sessionStorage.getItem(DELETION_USER_ID_KEY)).toBe('b-camille');
    });

    it('pendingStep_shouldBeNull_withoutTheDeleteIntent', () => {
      remember(NOW - 60_000);

      expect(service.pendingStep(camille.id, null)).toBeNull();
      expect(service.pendingStep(camille.id, 'deleted')).toBeNull();
    });

    it('pendingStep_shouldBeNull_withoutAMarker', () => {
      expect(service.pendingStep(camille.id, 'delete')).toBeNull();
    });

    it('pendingStep_shouldBeNull_andForgetTheMarker_whenItIsOlderThanTenMinutes', () => {
      remember(NOW - 11 * 60_000);

      expect(service.pendingStep(camille.id, 'delete')).toBeNull();
      expect(sessionStorage.getItem(DELETION_REQUESTED_AT_KEY)).toBeNull();
      expect(sessionStorage.getItem(DELETION_USER_ID_KEY)).toBeNull();
    });

    it('pendingStep_shouldBeNull_andForgetTheMarker_whenAnotherAccountSignedIn', () => {
      remember(NOW - 60_000, 'b-someone-else');

      expect(service.pendingStep(camille.id, 'delete')).toBeNull();
      expect(sessionStorage.getItem(DELETION_REQUESTED_AT_KEY)).toBeNull();
    });

    it('pendingStep_shouldBeReverify_whenTheTokenWasAuthenticatedBeforeTheRequest', () => {
      remember(NOW - 60_000);
      signedInAt(NOW - 3_600_000);

      expect(service.pendingStep(camille.id, 'delete')).toBe('reverify');
    });

    it('pendingStep_shouldBeConfirm_whenTheTokenHasNoAuthTime', () => {
      remember(NOW - 60_000);
      signedInAt(null);

      expect(service.pendingStep(camille.id, 'delete')).toBe('confirm');
    });

    it('pendingStep_shouldBeConfirm_whenTheDeviceClockIsAheadOfKeycloak', () => {
      // The device runs 5 minutes ahead: the request is stamped 14:05 there, Keycloak signs the login at 14:00:30.
      const keycloakNow = NOW - 300_000;
      remember(NOW - 30_000);
      signedInAt(keycloakNow + 30_000, 300);

      expect(service.pendingStep(camille.id, 'delete')).toBe('confirm');
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

      expect(keycloak.clearToken).toHaveBeenCalled();
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

    it('confirm_shouldReportUnavailable_andForgetTheRequest_whenDeletionIsSwitchedOff', async () => {
      remember(NOW);
      users.deleteAccount.mockReturnValue(refusal(403, 'USR-BUS-014'));

      expect(await service.confirm()).toBe('unavailable');
      expect(users.getDeletionEligibility).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(DELETION_REQUESTED_AT_KEY)).toBeNull();
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

  it('cancel_shouldForgetTheMarker', () => {
    remember(NOW);

    service.cancel();

    expect(sessionStorage.getItem(DELETION_REQUESTED_AT_KEY)).toBeNull();
    expect(sessionStorage.getItem(DELETION_USER_ID_KEY)).toBeNull();
  });
});
