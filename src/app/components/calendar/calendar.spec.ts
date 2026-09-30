import 'zone.js';
import 'zone.js/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CalendarComponent, CalendarEvent } from './calendar';
import { EventService, FeedEvent, EventCreateRequest } from '../../services/event.service';
import { Router } from '@angular/router';
import { Observable, Subject, of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('CalendarComponent', () => {
    let component: CalendarComponent;
    let fixture: ComponentFixture<CalendarComponent>;
    let eventServiceMock: Partial<EventService>;
    let routerMock: Partial<Router>;

    const mockEvents: FeedEvent[] = [
        { id: '101', title: 'External Event', organizerId: 'org1', startDate: new Date(), endDate: new Date(), location: 'Loc', image: 'img', description: '...' }
    ];

    beforeEach(async () => {
        TestBed.resetTestingModule();
        eventServiceMock = {
            refreshEvents: vi.fn(),
            subscribedEvents$: of(mockEvents),
            createEvent: vi.fn().mockReturnValue(of(mockEvents[0]))
        };
        routerMock = {
            navigate: vi.fn()
        };

        await TestBed.configureTestingModule({
            imports: [CalendarComponent, NoopAnimationsModule],
            providers: [
                { provide: EventService, useValue: eventServiceMock },
                { provide: Router, useValue: routerMock }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(CalendarComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should generate calendar on init', () => {
        expect(component.days().length).toBe(42);
        expect(component.events().length).toBeGreaterThan(mockEvents.length); // personal + subscribed
    });

    it('should change month when navigate(1) is called', () => {
        const initialMonth = component.currentDate().getMonth();
        component.navigate(1);
        expect(component.currentDate().getMonth()).toBe((initialMonth + 1) % 12);
    });

    it('should select a date and filter events', () => {
        const today = component.days().find(d => d.isToday);
        if (today) {
            component.selectDate(today);
            expect(component.selectedDate()).toEqual(today.date);
            expect(component.selectedEvents().length).toBeGreaterThan(0); // Should have at least the personal events
        }
    });

    it('should navigate to details on viewEventDetails', () => {
        const event = component.personalEvents[0];
        component.viewEventDetails(event);
        expect(routerMock.navigate).toHaveBeenCalledWith(['/event', 'calendar', event.id], expect.any(Object));
    });

    it('should change month when navigate(-1) is called', () => {
        const initialMonth = component.currentDate().getMonth();
        component.navigate(-1);
        expect(component.currentDate().getMonth()).toBe(initialMonth === 0 ? 11 : initialMonth - 1);
    });

    it('should filter out unsubscribed events', () => {
        // FeedEvent mapping happens in component via conversion
        const mixedEvents: FeedEvent[] = [
            { id: '1', title: 'Subbed', startDate: new Date(), endDate: new Date(), organizerId: 'o1', location: '', image: '', description: '' }
        ];
        (eventServiceMock as any).subscribedEvents$ = of(mixedEvents);
        component.ngOnInit();
        expect(component.events().some(e => e.title === 'Subbed')).toBe(true);
    });

    it('should toggle views and scroll', async () => {
        vi.useFakeTimers();
        // Stubbed rather than spied through: now that the view state is signals, advancing the
        // timer actually renders the week view, and the real method calls Element.scrollTo —
        // which the test DOM does not implement. What this asserts is that the scroll was
        // requested when the view changed.
        const scrollable = component as unknown as { scrollToCurrentTime: () => void };
        const scrollSpy = vi.spyOn(scrollable, 'scrollToCurrentTime')
            .mockImplementation(() => undefined);

        component.toggleView('week');
        expect(component.viewMode()).toBe('week');
        await vi.advanceTimersByTimeAsync(200);
        expect(scrollSpy).toHaveBeenCalled();

        component.toggleView('day');
        expect(component.viewMode()).toBe('day');
        expect(component.selectedDate()).not.toBeNull();

        component.toggleView('month');
        expect(component.viewMode()).toBe('month');
        expect(component.selectedDate()).toBeNull();
        scrollSpy.mockRestore();
        vi.useRealTimers();
    });

    it('should calculate event styles correctly', () => {
        const start = new Date();
        start.setHours(10, 0, 0, 0);
        const end = new Date();
        end.setHours(12, 0, 0, 0);
        const event = { id: 1, title: 'Test', startDate: start, endDate: end, time: '' };

        expect(component.getEventHeight(event as unknown as CalendarEvent)).toBe(200); // 2 hours = 200%

        start.setMinutes(30);
        expect(component.getEventMinuteOffset(event as unknown as CalendarEvent)).toBe(50); // 30 min = 50%
    });

    it('should get week number', () => {
        const date = new Date(2024, 0, 1); // Jan 1st 2024 is week 1
        expect(component.getWeekNumber(date)).toBe(1);
    });

    it('should submit event', () => {
        const data: EventCreateRequest = { title: 'New', startDate: new Date(), subscribeByDefault: false, location: '' };
        component.submitEvent(data);
        expect(eventServiceMock.createEvent).toHaveBeenCalledWith(data);
    });

    it('should select a date without events', () => {
        const aDate = new Date(2020, 0, 1);
        const day = { date: aDate, isToday: false, isCurrentMonth: true, hasEvents: false };
        component.selectDate(day);
        expect(component.selectedDate()).toEqual(aDate);
        expect(component.selectedEvents().length).toBe(0);
    });

    it('should close details', () => {
        component.selectedDate.set(new Date());
        component.closeDetails();
        expect(component.selectedDate()).toBeNull();
    });

    it('should clear the now-line interval on destroy', () => {
        // The subscription is now closed by takeUntilDestroyed, so what is left to verify is the
        // interval — which used to be created inside the subscription callback, so every emission
        // of subscribedEvents$ started another one and only the last handle was ever cleared.
        const clearSpy = vi.spyOn(globalThis, 'clearInterval');

        component.ngOnDestroy();

        expect(clearSpy).toHaveBeenCalled();
        clearSpy.mockRestore();
    });

    it('should keep the same now-line interval however often events arrive', () => {
        // The bug this guards: setInterval was called inside the subscription callback, so every
        // emission of subscribedEvents$ replaced the stored handle with a new interval and left
        // the previous one running until the tab closed. Asserted on the handle rather than on a
        // call count, because setInterval is global and Angular's own machinery uses it too.
        const events = new Subject<FeedEvent[]>();
        (eventServiceMock as { subscribedEvents$: Observable<FeedEvent[]> }).subscribedEvents$ =
            events.asObservable();

        component.ngOnInit();
        const handle = component['timeUpdateInterval'];
        expect(handle).toBeDefined();

        events.next(mockEvents);
        events.next(mockEvents);
        events.next(mockEvents);

        expect(component['timeUpdateInterval']).toBe(handle);
    });

    describe('Touch handling', () => {
        it('should NOT set isDragging for small movements', () => {
            const touchStartEvent = { touches: [{ clientY: 100 }] } as any;
            component.onDetailsTouchStart(touchStartEvent);
            expect(component['isDragging']).toBe(false);

            const touchMoveEvent = { touches: [{ clientY: 105 }], preventDefault: vi.fn() } as any;
            component.onDetailsTouchMove(touchMoveEvent);
            expect(component['isDragging']).toBe(false);
            expect(touchMoveEvent.preventDefault).not.toHaveBeenCalled();
        });

        it('should set isDragging for large downward movements', () => {
            const touchStartEvent = { touches: [{ clientY: 100 }] } as any;
            component.onDetailsTouchStart(touchStartEvent);

            const touchMoveEvent = {
                touches: [{ clientY: 115 }],
                preventDefault: vi.fn(),
                currentTarget: document.createElement('div')
            } as any;
            component.onDetailsTouchMove(touchMoveEvent);
            expect(component['isDragging']).toBe(true);
            expect(touchMoveEvent.preventDefault).toHaveBeenCalled();
        });

        it('should NOT set isDragging for large upward movements (as we only want downward dismiss)', () => {
            const touchStartEvent = { touches: [{ clientY: 100 }] } as any;
            component.onDetailsTouchStart(touchStartEvent);

            const touchMoveEvent = { touches: [{ clientY: 85 }], preventDefault: vi.fn() } as any;
            component.onDetailsTouchMove(touchMoveEvent);
            expect(component['isDragging']).toBe(false);
            expect(touchMoveEvent.preventDefault).not.toHaveBeenCalled();
        });
    });
});
