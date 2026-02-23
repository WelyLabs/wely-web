import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EventFeedComponent } from './event-feed';
import { EventService } from '../../services/event.service';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('EventFeedComponent', () => {
    let component: EventFeedComponent;
    let fixture: ComponentFixture<EventFeedComponent>;
    let eventServiceMock: any;
    let routerMock: any;

    let currentMockEvents: any[];

    beforeEach(async () => {
        currentMockEvents = [
            { id: '1', title: 'Event 1', organizerId: 'Org 1', startDate: new Date(), endDate: new Date(), location: 'Loc 1', image: '', description: 'Desc 1' }
        ];

        eventServiceMock = {
            feedEvents$: of(currentMockEvents),
            toggleSubscription: vi.fn().mockReturnValue(of({}))
        };
        routerMock = {
            navigate: vi.fn(),
            createUrlTree: vi.fn().mockReturnValue({}),
            serializeUrl: vi.fn().mockReturnValue('')
        };

        await TestBed.configureTestingModule({
            imports: [EventFeedComponent, NoopAnimationsModule],
            providers: [
                { provide: EventService, useValue: eventServiceMock },
                { provide: Router, useValue: routerMock }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(EventFeedComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should load events on init', () => {
        expect(component.events).toEqual(currentMockEvents);
    });

    it('should toggle subscription when swiped right', () => {
        vi.useFakeTimers();
        component.swipeRight();
        vi.advanceTimersByTime(300);
        expect(eventServiceMock.toggleSubscription).toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('should navigate to event details', () => {
        const event = currentMockEvents[0];
        component.viewEventDetails(event);
        expect(routerMock.navigate).toHaveBeenCalledWith(['/event', 'feed', event.id]);
    });
});
