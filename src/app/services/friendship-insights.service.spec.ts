import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CircleEntry, FriendshipInsightsService } from './friendship-insights.service';
import { FriendshipMemories, ReunionCandidate } from '../models/friendship-insights.model';
import { environment } from '../../environments/environment';

describe('FriendshipInsightsService', () => {
    let service: FriendshipInsightsService;
    let httpMock: HttpTestingController;
    const apiUrl = `${environment.apiUrl}/events-service/events/me`;

    beforeEach(() => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [FriendshipInsightsService] });
        service = TestBed.inject(FriendshipInsightsService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('getReunions_shouldReadTheCandidates', () => {
        const candidate: ReunionCandidate = {
            friendId: 'hugo', name: 'Hugo', closeness: 'CLOSE', lastSharedAt: '2026-06-01T19:00:00Z',
            lastSharedEventId: 'e1', lastSharedTitle: 'Ciné', monthsApart: 4
        };
        let result: ReunionCandidate[] | undefined;

        service.getReunions().subscribe(candidates => (result = candidates));
        const request = httpMock.expectOne(`${apiUrl}/reunions`);
        expect(request.request.method).toBe('GET');
        request.flush([candidate]);

        expect(result).toEqual([candidate]);
    });

    it('dismissReunion_shouldPostToTheFriendsDismissal', () => {
        let done = false;

        service.dismissReunion('hugo').subscribe(() => (done = true));
        const request = httpMock.expectOne(`${apiUrl}/reunions/hugo/dismiss`);
        expect(request.request.method).toBe('POST');
        request.flush(null, { status: 204, statusText: 'No Content' });

        expect(done).toBe(true);
    });

    it('dismissReunion_shouldFail_whenNotAFriend', () => {
        let failure: HttpErrorResponse | undefined;

        service.dismissReunion('stranger').subscribe({ error: (error: HttpErrorResponse) => (failure = error) });
        httpMock.expectOne(`${apiUrl}/reunions/stranger/dismiss`).flush(null, { status: 404, statusText: 'Not Found' });

        expect(failure?.status).toBe(404);
    });

    it('getMemories_shouldReadTheFriendshipsMemories', () => {
        const memories: FriendshipMemories = {
            friendId: 'lea', name: 'Léa', closeness: 'INTIMATE', since: '2025-03-03T10:00:00Z', years: 1, days: 412,
            sharedCount: 14, first: null, last: null, highlights: []
        };
        let result: FriendshipMemories | undefined;

        service.getMemories('lea').subscribe(read => (result = read));
        httpMock.expectOne(`${apiUrl}/friendships/lea/memories`).flush(memories);

        expect(result).toEqual(memories);
    });

    it('getMemories_shouldFail_whenNotFriends', () => {
        let failure: HttpErrorResponse | undefined;

        service.getMemories('stranger').subscribe({ error: (error: HttpErrorResponse) => (failure = error) });
        httpMock.expectOne(`${apiUrl}/friendships/stranger/memories`).flush(null, { status: 404, statusText: 'Not Found' });

        expect(failure?.status).toBe(404);
    });

    it('getCircle_shouldSendTheRange_andConvertTheDates', () => {
        const from = new Date('2026-10-12T00:00:00Z');
        const to = new Date('2026-10-19T00:00:00Z');
        let result: CircleEntry[] | undefined;

        service.getCircle(from, to).subscribe(entries => (result = entries));
        const request = httpMock.expectOne(r => r.url === `${apiUrl}/circle`);
        expect(request.request.params.get('from')).toBe(from.toISOString());
        expect(request.request.params.get('to')).toBe(to.toISOString());
        request.flush([
            { userId: 'lea', start: '2026-10-14T18:00:00Z', end: '2026-10-14T20:00:00Z', allDay: false, eventId: 'e1',
                title: 'Concert', location: 'Zénith', description: null },
            { userId: 'lea', start: 'not a date', end: '2026-10-14T20:00:00Z', allDay: false, eventId: null,
                title: null, location: null, description: null }
        ]);

        expect(result).toHaveLength(1);
        expect(result?.[0].start).toEqual(new Date('2026-10-14T18:00:00Z'));
        expect(result?.[0].title).toBe('Concert');
    });

    it('getCircle_shouldPlaceAnAllDayEntry_onItsLocalDays', () => {
        let result: CircleEntry[] | undefined;

        service.getCircle(new Date(), new Date()).subscribe(entries => (result = entries));
        httpMock.expectOne(r => r.url === `${apiUrl}/circle`).flush([
            { userId: 'hugo', start: '2026-10-15T00:00:00Z', end: '2026-10-16T00:00:00Z', allDay: true, eventId: null,
                title: null, location: null, description: null }
        ]);

        expect(result?.[0].allDay).toBe(true);
        expect(result?.[0].start).toEqual(new Date(2026, 9, 15));
        expect(result?.[0].end).toEqual(new Date(2026, 9, 16));
    });
});
