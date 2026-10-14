import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScheduleService } from './schedule.service';
import { EventService, FeedEvent, FreeRange } from './event.service';
import { environment } from '../../environments/environment';

describe('ScheduleService', () => {
  let service: ScheduleService;
  let httpMock: HttpTestingController;
  const refreshEvents = vi.fn();
  const url = `${environment.apiUrl}/events-service/events`;

  const bowling = {
    id: 'bowling', title: 'Bowling', organizerId: 'me', startDate: '2026-10-16T12:00:00Z', endDate: '2026-10-16T14:00:00Z',
    location: 'Lyon', image: null, description: ''
  };
  const start = new Date('2026-10-16T13:00:00Z');
  const end = new Date('2026-10-16T15:00:00Z');

  beforeEach(() => {
    refreshEvents.mockReset();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: EventService, useValue: { refreshEvents } }]
    });
    service = TestBed.inject(ScheduleService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('checkConflicts_shouldPostTheTime_andReadTheEventsWithDates', () => {
    let result: FeedEvent[] = [];
    service.checkConflicts(start, end, 'draft').subscribe(events => result = events);

    const request = httpMock.expectOne(`${url}/me/conflicts`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ start, end, excludedEventId: 'draft' });
    request.flush([bowling]);

    expect(result).toHaveLength(1);
    expect(result[0].startDate).toEqual(new Date('2026-10-16T12:00:00Z'));
  });

  it('getConflicts_shouldReadTheEventsConflicts', () => {
    let result: FeedEvent[] = [];
    service.getConflicts('doctor').subscribe(events => result = events);

    httpMock.expectOne(`${url}/doctor/conflicts`).flush([bowling]);

    expect(result.map(event => event.id)).toEqual(['bowling']);
  });

  it('getProposals_shouldReadTheRanges_droppingUnreadableOnes', () => {
    let result: FreeRange[] = [];
    service.getProposals('bowling').subscribe(ranges => result = ranges);

    httpMock.expectOne(`${url}/bowling/schedule/proposals`).flush([
      { start: '2026-10-16T13:00:00Z', end: '2026-10-16T15:00:00Z' },
      { start: 'not a date', end: '2026-10-16T15:00:00Z' }
    ]);

    expect(result).toEqual([{ start, end }]);
  });

  it('reschedule_shouldPutTheNewDates_andRefreshTheCalendar', () => {
    let result: FeedEvent | null = null;
    service.reschedule('bowling', start, end).subscribe(event => result = event);

    const request = httpMock.expectOne(`${url}/bowling/schedule`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ start, end });
    request.flush({ ...bowling, startDate: '2026-10-16T13:00:00Z', endDate: '2026-10-16T15:00:00Z' });

    expect(result!.startDate).toEqual(start);
    expect(refreshEvents).toHaveBeenCalledTimes(1);
  });

  it('reschedule_shouldNotRefresh_whenTheMoveIsRefused', () => {
    service.reschedule('bowling', start, end).subscribe({ error: () => undefined });

    httpMock.expectOne(`${url}/bowling/schedule`).flush({ code: 'EVT-BUS-002' }, { status: 403, statusText: 'Forbidden' });

    expect(refreshEvents).not.toHaveBeenCalled();
  });
});
