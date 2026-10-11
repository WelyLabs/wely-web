import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { EventService, FeedEvent } from './event.service';
import { environment } from '../../environments/environment';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Every assertion here runs unconditionally.
 *
 * The previous version asserted inside `subscribe` callbacks, some of them behind an
 * `if (events.length > 0)`. An observable that never emits makes that test pass while
 * verifying nothing — which is the failure mode a test suite is supposed to rule out.
 * Emissions are captured into a local and asserted after the flush instead, so a missing
 * emission fails the assertion rather than skipping it.
 */
describe('EventService', () => {
    let service: EventService;
    let httpMock: HttpTestingController;
    const apiUrl = `${environment.apiUrl}/events-service/events`;

    /** A payload shaped the way the backend actually sends it, dates included. */
    const payload = (overrides: Record<string, unknown> = {}) => ({
        id: '1',
        title: 'Test event',
        organizerId: 'org1',
        startDate: '2026-03-14T09:30:00Z',
        endDate: '2026-03-14T11:00:00Z',
        location: 'L',
        image: 'I',
        description: 'D',
        ...overrides,
    });

    beforeEach(() => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [EventService],
        });
        service = TestBed.inject(EventService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('issues no request on construction', () => {
        // The service is root-provided, so fetching on construction fired both requests at
        // bootstrap — including for a signed-out visitor on the landing page, where they
        // could only come back 401.
        expect(httpMock.match(`${apiUrl}/me/subscribed`)).toHaveLength(0);
        expect(httpMock.match(`${apiUrl}/me/feed`)).toHaveLength(0);
    });

    it('starts both lists empty', () => {
        let subscribed: FeedEvent[] | undefined;
        let feed: FeedEvent[] | undefined;
        service.subscribedEvents$.subscribe((e) => (subscribed = e));
        service.feedEvents$.subscribe((e) => (feed = e));

        expect(subscribed).toEqual([]);
        expect(feed).toEqual([]);
    });

    it('loads both lists on refreshEvents', () => {
        let subscribed: FeedEvent[] | undefined;
        let feed: FeedEvent[] | undefined;
        service.subscribedEvents$.subscribe((e) => (subscribed = e));
        service.feedEvents$.subscribe((e) => (feed = e));

        service.refreshEvents();

        const subscribedRequest = httpMock.expectOne(`${apiUrl}/me/subscribed`);
        expect(subscribedRequest.request.method).toBe('GET');
        subscribedRequest.flush([payload({ id: 'a' })]);

        const feedRequest = httpMock.expectOne(`${apiUrl}/me/feed`);
        expect(feedRequest.request.method).toBe('GET');
        feedRequest.flush([payload({ id: 'b' }), payload({ id: 'c' })]);

        expect(subscribed).toHaveLength(1);
        expect(subscribed?.[0].id).toBe('a');
        expect(feed?.map((e) => e.id)).toEqual(['b', 'c']);
    });

    it('converts an ISO date on the wire into a Date', () => {
        let subscribed: FeedEvent[] | undefined;
        service.subscribedEvents$.subscribe((e) => (subscribed = e));

        service.refreshEvents();
        httpMock.expectOne(`${apiUrl}/me/subscribed`).flush([payload()]);
        httpMock.expectOne(`${apiUrl}/me/feed`).flush([]);

        expect(subscribed?.[0].startDate).toBeInstanceOf(Date);
        expect(subscribed?.[0].startDate.toISOString()).toBe('2026-03-14T09:30:00.000Z');
    });

    it('converts the array date form, whose month is 1-based', () => {
        // Jackson can serialise an Instant as [year, month, day, hour, minute, second].
        // Month is 1-based there and 0-based in Date; getting that wrong shifts every
        // event by a month, which no round number in a fixture would reveal.
        let subscribed: FeedEvent[] | undefined;
        service.subscribedEvents$.subscribe((e) => (subscribed = e));

        service.refreshEvents();
        httpMock
            .expectOne(`${apiUrl}/me/subscribed`)
            .flush([payload({ startDate: [2026, 3, 14, 9, 30, 0], endDate: null })]);
        httpMock.expectOne(`${apiUrl}/me/feed`).flush([]);

        const start = subscribed?.[0].startDate;
        expect(start?.getFullYear()).toBe(2026);
        expect(start?.getMonth()).toBe(2); // March, 0-based
        expect(start?.getDate()).toBe(14);
        expect(start?.getHours()).toBe(9);
        expect(start?.getMinutes()).toBe(30);
    });

    it('defaults a missing end date to one hour after the start', () => {
        let subscribed: FeedEvent[] | undefined;
        service.subscribedEvents$.subscribe((e) => (subscribed = e));

        service.refreshEvents();
        httpMock
            .expectOne(`${apiUrl}/me/subscribed`)
            .flush([payload({ startDate: '2026-03-14T09:30:00Z', endDate: null })]);
        httpMock.expectOne(`${apiUrl}/me/feed`).flush([]);

        const event = subscribed?.[0];
        expect(event?.endDate.getTime()).toBe(event!.startDate.getTime() + 3_600_000);
    });

    it('falls back when the wire carries an unparseable date', () => {
        let subscribed: FeedEvent[] | undefined;
        service.subscribedEvents$.subscribe((e) => (subscribed = e));

        service.refreshEvents();
        httpMock
            .expectOne(`${apiUrl}/me/subscribed`)
            .flush([payload({ startDate: 'not a date', endDate: null })]);
        httpMock.expectOne(`${apiUrl}/me/feed`).flush([]);

        // A malformed date must not produce an Invalid Date that then spreads through
        // every comparison in the calendar.
        expect(subscribed?.[0].startDate.getTime()).not.toBeNaN();
        expect(subscribed?.[0].endDate.getTime()).not.toBeNaN();
    });

    it('posts a new event and refreshes both lists', () => {
        let created: FeedEvent | undefined;
        service
            .createEvent({
                title: 'New',
                startDate: new Date('2026-03-14T09:30:00Z'),
                location: 'L',
                subscribeByDefault: true,
            })
            .subscribe((event) => (created = event));

        const request = httpMock.expectOne(apiUrl);
        expect(request.request.method).toBe('POST');
        expect(request.request.body.title).toBe('New');
        request.flush(payload({ id: 'new' }));

        expect(created?.id).toBe('new');
        expect(created?.startDate).toBeInstanceOf(Date);

        // createEvent refreshes, so both lists are fetched again.
        httpMock.expectOne(`${apiUrl}/me/subscribed`).flush([]);
        httpMock.expectOne(`${apiUrl}/me/feed`).flush([]);
    });

    it('toggles a subscription and refreshes both lists', () => {
        const event: FeedEvent = {
            id: '1',
            title: 'Test',
            organizerId: 'org1',
            startDate: new Date(),
            endDate: new Date(),
            location: 'L',
            image: 'I',
            description: 'D',
        };

        let result: FeedEvent | undefined;
        service.toggleSubscription(event).subscribe((updated) => (result = updated));

        const request = httpMock.expectOne(`${apiUrl}/1/subscribe`);
        expect(request.request.method).toBe('POST');
        request.flush(payload({ id: '1' }));

        expect(result?.id).toBe('1');

        httpMock.expectOne(`${apiUrl}/me/subscribed`).flush([]);
        httpMock.expectOne(`${apiUrl}/me/feed`).flush([]);
    });

    it('searches free slots and converts the ranges into Dates', () => {
        const start = new Date('2026-10-16T14:00:00Z');
        const end = new Date('2026-10-18T20:00:00Z');
        let result: { start: Date; end: Date }[] | undefined;

        service.findFreeSlots({ friendIds: ['lea'], start, end, durationMinutes: 90 })
            .subscribe((ranges) => (result = ranges));

        const req = httpMock.expectOne(`${apiUrl}/me/free-slots`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ friendIds: ['lea'], start, end, durationMinutes: 90 });
        req.flush([{ start: '2026-10-16T14:00:00Z', end: '2026-10-16T18:00:00Z' }]);

        expect(result).toEqual([{ start: new Date('2026-10-16T14:00:00Z'), end: new Date('2026-10-16T18:00:00Z') }]);
    });

    it('reads a friend calendar for a period and converts its dates', () => {
        let result: unknown;
        const from = new Date('2026-10-12T00:00:00Z');
        const to = new Date('2026-10-19T00:00:00Z');
        service.getFriendCalendar('bob', from, to).subscribe(entries => result = entries);

        const req = httpMock.expectOne(r => r.url === `${apiUrl}/users/bob/calendar`
            && r.params.get('from') === from.toISOString() && r.params.get('to') === to.toISOString());
        expect(req.request.method).toBe('GET');
        req.flush([
            { start: '2026-10-14T18:00:00Z', end: '2026-10-14T20:00:00Z', eventId: null, title: null, location: null, description: null },
            { start: null, end: null, eventId: null, title: 'broken', location: null, description: null }
        ]);

        expect(result).toEqual([{
            start: new Date('2026-10-14T18:00:00Z'), end: new Date('2026-10-14T20:00:00Z'),
            eventId: null, title: null, location: null, description: null
        }]);
    });
});
