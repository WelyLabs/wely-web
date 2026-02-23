import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EventFeedComponent } from './event-feed';
import { EventService, FeedEvent } from '../../services/event.service';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('EventFeedComponent', () => {
    let component: EventFeedComponent;
    let fixture: ComponentFixture<EventFeedComponent>;
    let eventServiceMock: any;
    let routerMock: any;

    const mockEvents: any[] = [
        { id: '1', title: 'Event 1', organizerId: 'Org 1', startDate: new Date(), endDate: new Date(), location: 'Loc 1', image: '', description: 'Desc 1' }
    ];

    beforeEach(async () => {
        eventServiceMock = {
            feedEvents$: of(mockEvents),
            toggleSubscription: vi.fn().mockReturnValue(of({}))
        };
        routerMock = {
            navigate: vi.fn(),
            createUrlTree: vi.fn().mockReturnValue({}),
            serializeUrl: vi.fn().mockReturnValue('')
        };

        await TestBed.configureTestingModule({
            imports: [EventFeedComponent, NoopAnimationsModule],
        }).overrideComponent(EventFeedComponent, {
            set: {
                providers: [
                    { provide: EventService, useValue: eventServiceMock },
                    { provide: Router, useValue: routerMock }
                ]
            }
        }).compileComponents();

        fixture = TestBed.createComponent(EventFeedComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should load events on init', () => {
        expect(component.events).toEqual(mockEvents);
    });

    it('should toggle subscription when swiped right', () => {
        component.swipeRight();
        expect(eventServiceMock.toggleSubscription).toHaveBeenCalled();
    });

    it('should navigate to event details', () => {
        const event = mockEvents[0];
        component.viewEventDetails(event);
        expect(routerMock.navigate).toHaveBeenCalledWith(['/event', 'feed', event.id]);
    });
});
