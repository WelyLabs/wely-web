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
        // Exactly the subscribed events, and nothing else. Three hardcoded demo events used to
        // be merged in, which is why this assertion read "greater than".
        expect(component.events().length).toBe(mockEvents.length);
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
        const event: CalendarEvent = {
            id: '101',
            title: 'External Event',
            time: '10:00 AM - 11:00 AM',
            description: '...',
            startDate: new Date(),
            endDate: new Date(),
        };
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
    /**
     * Characterisation tests for the popover geometry, written before refactoring
     * calculatePopoverPosition and kept afterwards. They pin what the function produces
     * rather than how it produces it: the signals it writes, for each view mode and each
     * side of the grid. Nothing covered this before, and it is the most intricate function
     * in the component.
     */
    describe('popover placement', () => {
        const POPOVER_WIDTH = 320;
        const POPOVER_HEIGHT = 400;

        /** A DOM stub whose only job is to answer getBoundingClientRect. */
        const rect = (left: number, top: number, width: number, height: number) => ({
            getBoundingClientRect: () => ({
                left, top, right: left + width, bottom: top + height, width, height,
            }),
            querySelector: () => null,
            parentElement: null,
        });

        /** Points the component at a fake calendar DOM. */
        const stubDom = (container: unknown, cells: unknown[], selector = '.day-cell') => {
            const native = (component as unknown as { el: { nativeElement: HTMLElement } }).el
                .nativeElement as unknown as Record<string, unknown>;
            native['querySelector'] = (s: string) => (s === '.calendar-container' ? container : null);
            native['querySelectorAll'] = (s: string) => (s === selector ? cells : []);
        };

        const click = (x: number, y: number) =>
            ({ clientX: x, clientY: y }) as MouseEvent;

        const place = (event: MouseEvent, date?: Date | null) =>
            (component as unknown as {
                calculatePopoverPosition: (e: MouseEvent, d?: Date | null) => void;
            }).calculatePopoverPosition(event, date);

        beforeEach(() => {
            Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
            Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
        });

        it('pins the popover to the corner on a narrow screen', () => {
            Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
            stubDom(rect(0, 0, 500, 900), []);

            place(click(100, 200), component.days()[10].date);

            expect(component.isMobilePopover()).toBe(true);
            expect(component.popoverPosition()).toEqual({ x: 0, y: 0, arrowSide: 'top' });
        });

        it('opens to the right of a cell in the left half of the month grid', () => {
            const cells = component.days().map((_, i) => rect(100 + (i % 7) * 100, 200, 90, 80));
            stubDom(rect(0, 0, 1400, 900), cells);

            // days()[0] sits in column 0, which is <= 3, so the popover opens to its right.
            place(click(0, 0), component.days()[0].date);

            const position = component.popoverPosition();
            expect(position.arrowSide).toBe('left');
            expect(position.x).toBe(100 + 90 + 5);
        });

        it('opens to the left of a cell in the right half of the month grid', () => {
            const cells = component.days().map((_, i) => rect(100 + (i % 7) * 100, 200, 90, 80));
            stubDom(rect(0, 0, 1400, 900), cells);

            // Column 4 is > 3, so the popover flips to the other side of the cell.
            place(click(0, 0), component.days()[4].date);

            const position = component.popoverPosition();
            expect(position.arrowSide).toBe('right');
            expect(position.x).toBe(100 + 4 * 100 - POPOVER_WIDTH - 5);
        });

        it('centres the popover vertically on the anchor cell', () => {
            const cells = component.days().map((_, i) => rect(100 + (i % 7) * 100, 200, 90, 80));
            stubDom(rect(0, 0, 1400, 900), cells);

            place(click(0, 0), component.days()[0].date);

            // Cell centre is 200 + 80/2 = 240; the popover is centred on it.
            expect(component.popoverPosition().y).toBe(240 - POPOVER_HEIGHT / 2);
        });

        it('falls back to the click position when the date is not on screen', () => {
            stubDom(rect(0, 0, 1400, 900), []);

            place(click(600, 300), new Date(1900, 0, 1));

            const position = component.popoverPosition();
            expect(position.arrowSide).toBe('top');
            expect(position.x).toBe(600);
            expect(position.y).toBe(300);
            expect(component.arrowOffset()).toBe(50);
        });

        it('keeps the popover inside the container', () => {
            stubDom(rect(0, 0, 1000, 700), []);

            place(click(9999, 9999), new Date(1900, 0, 1));

            // Clamped to maxWidth - width - padding and maxHeight - height - padding.
            expect(component.popoverPosition().x).toBe(1000 - POPOVER_WIDTH - 20);
            expect(component.popoverPosition().y).toBe(700 - POPOVER_HEIGHT - 20);
        });

        it('anchors on the selection overlay in week view', () => {
            // A drag leaves a .selection-overlay inside the column; the popover points at
            // the dragged range, not at the middle of the whole day.
            const overlay = rect(300, 400, 90, 60);
            const column = {
                ...rect(300, 100, 90, 600),
                querySelector: (s: string) => (s === '.selection-overlay' ? overlay : null),
                parentElement: { children: [] as unknown[] },
            };
            const columns = component.days().map((_, i) => (i === 3 ? column : rect(0, 0, 0, 0)));
            column.parentElement.children = columns;

            component.viewMode.set('week');
            component.selectionDate = component.days()[3].date;
            stubDom(rect(0, 0, 1400, 900), columns, '.day-column');

            place(click(0, 0), component.days()[3].date);

            // Overlay centre is 400 + 60/2 = 430.
            expect(component.popoverPosition().y).toBe(430 - POPOVER_HEIGHT / 2);
        });

        it('falls back to the column centre when nothing was dragged', () => {
            const column = {
                ...rect(300, 100, 90, 600),
                querySelector: () => null,
                parentElement: { children: [] as unknown[] },
            };
            const columns = component.days().map((_, i) => (i === 3 ? column : rect(0, 0, 0, 0)));
            column.parentElement.children = columns;

            component.viewMode.set('week');
            component.selectionDate = null;
            stubDom(rect(0, 0, 1400, 900), columns, '.day-column');

            place(click(0, 0), component.days()[3].date);

            // Column centre is 100 + 600/2 = 400.
            expect(component.popoverPosition().y).toBe(400 - POPOVER_HEIGHT / 2);
        });

        it('clamps the arrow offset to the popover', () => {
            const cells = component.days().map((_, i) => rect(100 + (i % 7) * 100, 200, 90, 80));
            stubDom(rect(0, 0, 1400, 900), cells);

            place(click(0, 0), component.days()[0].date);

            const offset = component.arrowOffset();
            expect(offset).toBeGreaterThanOrEqual(10);
            expect(offset).toBeLessThanOrEqual(90);
        });
    });

});
