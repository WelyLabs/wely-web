import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CalendarComponent } from './calendar';
import { Event } from '../../services/event.service';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('CalendarComponent', () => {
    let component: CalendarComponent;
    let fixture: ComponentFixture<CalendarComponent>;
    let eventServiceMock: any;
    let routerMock: any;

    const mockEvents = [
        { id: 101, title: 'External Event', subscribed: true, date: new Date(), description: '...' }
    ];

    beforeEach(async () => {
        eventServiceMock = {
            events$: of(mockEvents)
        };
        routerMock = {
            navigate: vi.fn()
        };

        await TestBed.configureTestingModule({
            imports: [CalendarComponent, NoopAnimationsModule],
            providers: [
                { provide: Event, useValue: eventServiceMock },
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
        const mixedEvents = [
            { id: 1, title: 'Subbed', subscribed: true, date: new Date() },
            { id: 2, title: 'Unsubbed', subscribed: false, date: new Date() }
        ];
        eventServiceMock.events$ = of(mixedEvents);
        component.ngOnInit();
        expect(component.events.some(e => e.title === 'Subbed')).toBe(true);
        expect(component.events.some(e => e.title === 'Unsubbed')).toBe(false);
    });

    it('should select a date without events', () => {
        const aDate = new Date(2020, 0, 1);
        const day: any = { date: aDate, isToday: false };
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
