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
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [EventService]
        });
        service = TestBed.inject(EventService);
        httpMock = TestBed.inject(HttpTestingController);

        // Flush initial requests from constructor
        const reqSub = httpMock.expectOne(`${apiUrl}/me/subscribed`);
        reqSub.flush([]);
        const reqFeed = httpMock.expectOne(`${apiUrl}/me/feed`);
        reqFeed.flush([]);
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

        service.subscribedEvents$.subscribe((events: FeedEvent[]) => {
            if (events && events.length > 0) {
                expect(events).toEqual(mockEvents);
            }
        });

        // Trigger a refresh to test loading (beyond constructor)
        service.refreshEvents();

        const reqSub = httpMock.expectOne(`${apiUrl}/me/subscribed`);
        reqSub.flush(mockEvents);

        const reqFeed = httpMock.expectOne(`${apiUrl}/me/feed`);
        reqFeed.flush([]);
    });

    it('should toggle subscription status', () => {
        const mockEvent: FeedEvent = { id: '1', title: 'Test', organizerId: 'org1', startDate: new Date(), endDate: new Date(), location: 'L', image: 'I', description: 'D' };

        service.toggleSubscription(mockEvent).subscribe((res: FeedEvent) => {
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
