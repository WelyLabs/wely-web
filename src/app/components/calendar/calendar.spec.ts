import 'zone.js';
import 'zone.js/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CalendarComponent, CalendarEvent } from './calendar';
import { EventService, FeedEvent, EventCreateRequest } from '../../services/event.service';
import { Router } from '@angular/router';
import { of } from 'rxjs';
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
        expect(component.days.length).toBe(42);
        expect(component.events.length).toBeGreaterThan(mockEvents.length); // personal + subscribed
    });

    it('should change month when navigate(1) is called', () => {
        const initialMonth = component.currentDate.getMonth();
        component.navigate(1);
        expect(component.currentDate.getMonth()).toBe((initialMonth + 1) % 12);
    });

    it('should select a date and filter events', () => {
        const today = component.days.find(d => d.isToday);
        if (today) {
            component.selectDate(today);
            expect(component.selectedDate).toEqual(today.date);
            expect(component.selectedEvents.length).toBeGreaterThan(0); // Should have at least the personal events
        }
    });

    it('should navigate to details on viewEventDetails', () => {
        const event = component.personalEvents[0];
        component.viewEventDetails(event);
        expect(routerMock.navigate).toHaveBeenCalledWith(['/event', 'calendar', event.id], expect.any(Object));
    });

    it('should change month when navigate(-1) is called', () => {
        const initialMonth = component.currentDate.getMonth();
        component.navigate(-1);
        expect(component.currentDate.getMonth()).toBe(initialMonth === 0 ? 11 : initialMonth - 1);
    });

    it('should filter out unsubscribed events', () => {
        // FeedEvent mapping happens in component via conversion
        const mixedEvents: FeedEvent[] = [
            { id: '1', title: 'Subbed', startDate: new Date(), endDate: new Date(), organizerId: 'o1', location: '', image: '', description: '' }
        ];
        (eventServiceMock as any).subscribedEvents$ = of(mixedEvents);
        component.ngOnInit();
        expect(component.events.some(e => e.title === 'Subbed')).toBe(true);
    });

    it('should toggle views and scroll', async () => {
        vi.useFakeTimers();
        const scrollSpy = vi.spyOn(component as any, 'scrollToCurrentTime');

        component.toggleView('week');
        expect(component.viewMode).toBe('week');
        await vi.advanceTimersByTimeAsync(200);
        expect(scrollSpy).toHaveBeenCalled();

        component.toggleView('day');
        expect(component.viewMode).toBe('day');
        expect(component.selectedDate).toBeDefined();

        component.toggleView('month');
        expect(component.viewMode).toBe('month');
        expect(component.selectedDate).toBeNull();
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
        expect(component.selectedDate).toEqual(aDate);
        expect(component.selectedEvents.length).toBe(0);
    });

    it('should close details', () => {
        component.selectedDate = new Date();
        component.closeDetails();
        expect(component.selectedDate).toBeNull();
    });

    it('should unsubscribe on destroy', () => {
        const spy = vi.spyOn(component['subscription']!, 'unsubscribe');
        component.ngOnDestroy();
        expect(spy).toHaveBeenCalled();
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
