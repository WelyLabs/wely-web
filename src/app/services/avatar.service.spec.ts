import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { AvatarService } from './avatar.service';
import { environment } from '../../environments/environment';

describe('AvatarService', () => {
  const apiUrl = `${environment.apiUrl}/user-service/avatars`;
  let service: AvatarService;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AvatarService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('url_shouldAskForTheIdsOfAScreenInOneRequest', () => {
    const camille = service.url('camille');
    const lea = service.url('lea');
    service.url('camille');

    vi.advanceTimersByTime(50);
    const request = http.expectOne(apiUrl);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ userIds: ['camille', 'lea'] });
    request.flush({ camille: 'https://media/camille' });

    expect(camille()).toBe('https://media/camille');
    // No picture: null, and the screen shows initials.
    expect(lea()).toBeNull();
  });

  it('url_shouldReuseAValidUrlWithoutAskingAgain', () => {
    service.url('camille');
    vi.advanceTimersByTime(50);
    http.expectOne(apiUrl).flush({ camille: 'https://media/camille' });

    vi.advanceTimersByTime(10 * 60_000);
    expect(service.url('camille')()).toBe('https://media/camille');
    vi.advanceTimersByTime(50);
    http.expectNone(apiUrl);
  });

  it('url_shouldAskAgainBeforeTheSignatureExpires', () => {
    service.url('camille');
    vi.advanceTimersByTime(50);
    http.expectOne(apiUrl).flush({ camille: 'https://media/old' });

    vi.advanceTimersByTime(51 * 60_000);
    const camille = service.url('camille');
    vi.advanceTimersByTime(50);
    http.expectOne(apiUrl).flush({ camille: 'https://media/new' });

    expect(camille()).toBe('https://media/new');
  });

  it('invalidate_shouldFetchTheNewPictureForEveryReader', () => {
    const camille = service.url('camille');
    vi.advanceTimersByTime(50);
    http.expectOne(apiUrl).flush({ camille: 'https://media/old' });

    service.invalidate('camille');
    vi.advanceTimersByTime(50);
    http.expectOne(apiUrl).flush({ camille: 'https://media/new' });

    expect(camille()).toBe('https://media/new');
  });

  it('url_shouldSplitLargeScreensIntoBatchesOfAHundred', () => {
    for (let i = 0; i < 150; i++) {
      service.url(`u${i}`);
    }
    vi.advanceTimersByTime(50);

    const requests = http.match(apiUrl);
    expect(requests.map(request => request.request.body.userIds.length)).toEqual([100, 50]);
    requests.forEach(request => request.flush({}));
  });

  it('url_shouldRetryAfterAMinute_whenTheRequestFails', () => {
    service.url('camille');
    vi.advanceTimersByTime(50);
    http.expectOne(apiUrl).flush(null, { status: 502, statusText: 'Bad Gateway' });

    service.url('camille');
    vi.advanceTimersByTime(50);
    http.expectNone(apiUrl);

    vi.advanceTimersByTime(60_000);
    service.url('camille');
    vi.advanceTimersByTime(50);
    http.expectOne(apiUrl).flush({});
  });

  it('url_shouldAnswerNull_forNoUser', () => {
    expect(service.url(undefined)()).toBeNull();
    vi.advanceTimersByTime(50);
    http.expectNone(apiUrl);
  });
});
