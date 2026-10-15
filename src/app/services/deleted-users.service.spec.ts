import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeletedUsersService } from './deleted-users.service';
import { LoggerService } from '../core/logging/logger.service';
import { environment } from '../../environments/environment';

describe('DeletedUsersService', () => {
  const apiUrl = `${environment.apiUrl}/user-service/users/deleted`;
  let service: DeletedUsersService;
  let http: HttpTestingController;
  let logger: { warn: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    logger = { warn: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: LoggerService, useValue: logger }]
    });
    service = TestBed.inject(DeletedUsersService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  const answer = (deletedIds: string[]) => {
    vi.advanceTimersByTime(50);
    http.expectOne(apiUrl).flush({ deletedIds });
  };

  it('isDeleted_shouldBeFalse_thenTrue_whenTheServerConfirms', () => {
    const lea = service.isDeleted('lea');
    expect(lea()).toBe(false);

    vi.advanceTimersByTime(50);
    const request = http.expectOne(apiUrl);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ userIds: ['lea'] });
    request.flush({ deletedIds: ['lea'] });

    expect(lea()).toBe(true);
  });

  it('isDeleted_shouldSendIdsAskedTogether_inOneRequest', () => {
    const lea = service.isDeleted('lea');
    const hugo = service.isDeleted('hugo');
    service.isDeleted('lea');

    vi.advanceTimersByTime(50);
    const request = http.expectOne(apiUrl);
    expect(request.request.body).toEqual({ userIds: ['lea', 'hugo'] });
    request.flush({ deletedIds: ['hugo'] });

    expect(lea()).toBe(false);
    expect(hugo()).toBe(true);
  });

  it('isDeleted_shouldSplitIntoBatchesOfAHundred', () => {
    for (let i = 0; i < 150; i++) {
      service.isDeleted(`u${i}`);
    }
    vi.advanceTimersByTime(50);

    const requests = http.match(apiUrl);
    expect(requests.map(request => request.request.body.userIds.length)).toEqual([100, 50]);
    requests.forEach(request => request.flush({ deletedIds: [] }));
  });

  it('isDeleted_shouldNeverAskAgain_forAConfirmedDeletion', () => {
    service.isDeleted('lea');
    answer(['lea']);

    vi.advanceTimersByTime(24 * 60 * 60_000);
    expect(service.isDeleted('lea')()).toBe(true);
    vi.advanceTimersByTime(50);
    http.expectNone(apiUrl);
  });

  it('isDeleted_shouldAskAgain_afterTenMinutes_forALiveUser', () => {
    service.isDeleted('lea');
    answer([]);

    service.isDeleted('lea');
    vi.advanceTimersByTime(50);
    http.expectNone(apiUrl);

    vi.advanceTimersByTime(10 * 60_000);
    const lea = service.isDeleted('lea');
    answer(['lea']);
    expect(lea()).toBe(true);
  });

  const fail = (status = 502) => http.expectOne(apiUrl).flush(null, { status, statusText: 'Failed' });

  it('isDeleted_shouldRetryAfterAMinute_withoutBeingCalledAgain_whenTheRequestFails', () => {
    const isDeleted = vi.spyOn(service, 'isDeleted');
    const label = computed(() => service.isDeleted('lea')() ? 'Utilisateur supprimé' : 'Quelqu’un');
    expect(label()).toBe('Quelqu’un');
    vi.advanceTimersByTime(50);
    fail();
    expect(logger.warn).toHaveBeenCalled();
    expect(label()).toBe('Quelqu’un');

    vi.advanceTimersByTime(60_000 + 50);

    // The screen's computed never ran again: the retry came from the service.
    expect(isDeleted).toHaveBeenCalledTimes(1);
    http.expectOne(apiUrl).flush({ deletedIds: ['lea'] });
    expect(label()).toBe('Utilisateur supprimé');
  });

  it('isDeleted_shouldNotAskBeforeAMinute_whenAScreenAsksAgainAfterAFailure', () => {
    service.isDeleted('lea');
    vi.advanceTimersByTime(50);
    fail();

    service.isDeleted('lea');
    vi.advanceTimersByTime(50);
    http.expectNone(apiUrl);

    vi.advanceTimersByTime(60_000);
    expect(service.isDeleted('lea')()).toBe(false);
    http.expectOne(apiUrl).flush({ deletedIds: [] });
  });

  it('isDeleted_shouldStopRetryingOnItsOwn_afterThreeFailures', () => {
    service.isDeleted('lea');
    vi.advanceTimersByTime(50);
    fail(404);
    vi.advanceTimersByTime(60_000 + 50);
    fail(404);
    vi.advanceTimersByTime(60_000 + 50);
    fail(404);

    vi.advanceTimersByTime(10 * 60_000);
    http.expectNone(apiUrl);
    expect(logger.warn).toHaveBeenCalledTimes(3);

    // A screen asking again is still answered.
    const lea = service.isDeleted('lea');
    answer(['lea']);
    expect(lea()).toBe(true);
  });

  it('isDeleted_shouldNotRetry_anIdAnsweredMeanwhile', async () => {
    service.isDeleted('lea');
    vi.advanceTimersByTime(50);
    fail();

    const result = firstValueFrom(service.deletedAmong(['lea']));
    http.expectOne(apiUrl).flush({ deletedIds: [] });
    expect([...await result]).toEqual([]);

    vi.advanceTimersByTime(60_000 + 50);
    http.expectNone(apiUrl);
  });

  it('isDeleted_shouldBeFalseWithoutRequest_whenThereIsNoId', () => {
    expect(service.isDeleted(null)()).toBe(false);
    expect(service.isDeleted(undefined)()).toBe(false);
    vi.advanceTimersByTime(50);
    http.expectNone(apiUrl);
  });

  it('isDeleted_shouldBeCallableInsideComputed', () => {
    const label = computed(() => service.isDeleted('lea')() ? 'Utilisateur supprimé' : 'Quelqu’un');

    // A signal write inside computed() would throw NG0600 here.
    expect(label()).toBe('Quelqu’un');
    answer(['lea']);

    expect(label()).toBe('Utilisateur supprimé');
  });

  it('check_shouldAnswerTrue_andRememberIt_forADeletedId', async () => {
    const result = firstValueFrom(service.check('lea'));
    const request = http.expectOne(apiUrl);
    expect(request.request.body).toEqual({ userIds: ['lea'] });
    request.flush({ deletedIds: ['lea'] });

    expect(await result).toBe(true);
    expect(service.isDeleted('lea')()).toBe(true);
    expect(await firstValueFrom(service.check('lea'))).toBe(true);
    vi.advanceTimersByTime(50);
    http.expectNone(apiUrl);
  });

  it('check_shouldAnswerFalse_forALiveId', async () => {
    const result = firstValueFrom(service.check('lea'));
    http.expectOne(apiUrl).flush({ deletedIds: [] });

    expect(await result).toBe(false);
  });

  it('check_shouldPropagateTheError_whenTheRequestFails', async () => {
    const result = firstValueFrom(service.check('lea'));
    http.expectOne(apiUrl).flush(null, { status: 503, statusText: 'Unavailable' });

    await expect(result).rejects.toMatchObject({ status: 503 });
  });

  it('deletedAmong_shouldAskOnlyForTheIdsNotConfirmedYet', async () => {
    service.isDeleted('lea');
    answer(['lea']);

    const result = firstValueFrom(service.deletedAmong(['lea', 'hugo', 'zoe']));
    const request = http.expectOne(apiUrl);
    expect(request.request.body).toEqual({ userIds: ['hugo', 'zoe'] });
    request.flush({ deletedIds: ['zoe'] });

    expect([...await result].sort()).toEqual(['lea', 'zoe']);
  });

  it('deletedAmong_shouldAnswerAtOnce_whenEveryIdIsAlreadyConfirmed', async () => {
    service.isDeleted('lea');
    answer(['lea']);

    expect([...await firstValueFrom(service.deletedAmong(['lea']))]).toEqual(['lea']);
    http.expectNone(apiUrl);
  });
});
