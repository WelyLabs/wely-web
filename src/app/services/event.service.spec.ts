import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { EventService, FeedEvent } from './event.service';
import { environment } from '../../environments/environment';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('EventService', () => {
    let service: EventService;
    let httpMock: HttpTestingController;
    const apiUrl = `${environment.apiUrl}/events-service/events`;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [EventService]
        });
        service = TestBed.inject(EventService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('should load subscribed events', () => {
        const mockEvents: FeedEvent[] = [
            { id: '1', title: 'Test event', organizerId: 'org1', startDate: new Date(), endDate: new Date(), location: 'L', image: 'I', description: 'D' }
        ];

        service.subscribedEvents$.subscribe(events => {
            if (events && events.length > 0) {
                expect(events).toEqual(mockEvents);
            }
        });

        // The service calls refreshEvents in constructor, so we expect two calls: one for me/subscribed, one for me/feed
        const reqSub = httpMock.expectOne(`${apiUrl}/me/subscribed`);
        reqSub.flush(mockEvents);

        const reqFeed = httpMock.expectOne(`${apiUrl}/me/feed`);
        reqFeed.flush([]);
    });

    it('should toggle subscription status', () => {
        const mockEvent: FeedEvent = { id: '1', title: 'Test', organizerId: 'org1', startDate: new Date(), endDate: new Date(), location: 'L', image: 'I', description: 'D' };

        service.toggleSubscription(mockEvent).subscribe(res => {
            expect(res).toEqual(mockEvent);
        });

        const req = httpMock.expectOne(`${apiUrl}/${mockEvent.id}/subscribe`);
        expect(req.request.method).toBe('POST');
        req.flush(mockEvent);

        // toggleSubscription also triggers refreshEvents
        httpMock.expectOne(`${apiUrl}/me/subscribed`).flush([]);
        httpMock.expectOne(`${apiUrl}/me/feed`).flush([]);
    });
});
