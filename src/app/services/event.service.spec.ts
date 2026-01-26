import { TestBed } from '@angular/core/testing';
import { Event, FeedEvent } from './event.service';
import { describe, it, expect, beforeEach } from 'vitest';
import { tap, take } from 'rxjs';

describe('EventService', () => {
    let service: Event;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [Event]
        });
        service = TestBed.inject(Event);
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('should have a list of events', () => {
        return service.events$.pipe(
            tap(events => {
                expect(events.length).toBeGreaterThan(0);
            }),
            take(1) // Take one emission to complete the observable for the test
        );
    });

    it('should toggle subscription status', () => {
        let events: FeedEvent[] = [];
        service.events$.subscribe(e => events = e);

        const event = events[0];
        const initialStatus = event.subscribed;

        service.toggleSubscription(event);

        expect(events[0].subscribed).toBe(!initialStatus);
    });
});
