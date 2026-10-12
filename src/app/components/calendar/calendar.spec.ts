import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CalendarComponent, CalendarEvent } from './calendar';
import { EventService, FeedEvent, EventCreateRequest } from '../../services/event.service';
import { Router } from '@angular/router';
import { Observable, Subject, of } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SocialService } from '../../services/social.service';
import { FriendSummary } from '../../models/friendship.model';
import { throwError } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('CalendarComponent', () => {
    let component: CalendarComponent;
    let fixture: ComponentFixture<CalendarComponent>;
    let eventServiceMock: Partial<EventService>;
    let routerMock: Partial<Router>;
    let socialServiceMock: { listFriendships: ReturnType<typeof vi.fn> };
    const friendships: FriendSummary[] = [
        { userId: 'lea', userName: 'lea', hashtag: 6000, closeness: 'CLOSE', proposal: null, proposedByFriend: false },
        { userId: 'hugo', userName: 'hugo', hashtag: 9074, closeness: 'FRIEND', proposal: null, proposedByFriend: false }
    ];

    const mockEvents: FeedEvent[] = [
        { id: '101', title: 'External Event', organizerId: 'org1', startDate: new Date(), endDate: new Date(), location: 'Loc', image: 'img', description: '...' }
    ];

    beforeEach(async () => {
        TestBed.resetTestingModule();
        eventServiceMock = {
            refreshEvents: vi.fn(),
            subscribedEvents$: of(mockEvents),
            createEvent: vi.fn().mockReturnValue(of(mockEvents[0])),
            getFriendCalendar: vi.fn().mockReturnValue(of([])),
            findFreeSlots: vi.fn().mockReturnValue(of([]))
        };
        routerMock = {
            navigate: vi.fn()
        };

        socialServiceMock = {
            listFriendships: vi.fn().mockReturnValue(of(friendships))
        };

        await TestBed.configureTestingModule({
            imports: [CalendarComponent, NoopAnimationsModule],
            providers: [
                { provide: EventService, useValue: eventServiceMock },
                { provide: SocialService, useValue: socialServiceMock },
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
        expect(routerMock.navigate).toHaveBeenCalledWith(['/event', event.id], expect.any(Object));
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

        /** A panel holding an events list, scrolled to the given offset. */
        const panelWithList = (scrollTop: number) => {
            const panel = document.createElement('div');
            const list = document.createElement('div');
            list.className = 'events-list';
            Object.defineProperty(list, 'scrollTop', { value: scrollTop });
            panel.appendChild(list);
            return { panel, list };
        };

        it('onDetailsTouchMove_shouldLetAScrolledListScrollBackUp', () => {
            const { panel, list } = panelWithList(120);
            component.onDetailsTouchStart({ touches: [{ clientY: 100 }], currentTarget: panel, target: list } as any);

            const move = { touches: [{ clientY: 160 }], preventDefault: vi.fn(), currentTarget: panel } as any;
            component.onDetailsTouchMove(move);

            expect(component['isDragging']).toBe(false);
            expect(move.preventDefault).not.toHaveBeenCalled();
        });

        it('onDetailsTouchMove_shouldDragAListAtItsTop', () => {
            const { panel, list } = panelWithList(0);
            component.onDetailsTouchStart({ touches: [{ clientY: 100 }], currentTarget: panel, target: list } as any);

            component.onDetailsTouchMove({ touches: [{ clientY: 160 }], preventDefault: vi.fn(), currentTarget: panel } as any);

            expect(component['isDragging']).toBe(true);
        });

        it('onDetailsTouchEnd_shouldCloseThePanel_afterALongSwipeDown', () => {
            const { panel } = panelWithList(0);
            component.isDetailsOpen.set(true);
            component.selectedDate.set(new Date(2026, 9, 14));
            component.onDetailsTouchStart({ touches: [{ clientY: 100 }], currentTarget: panel, target: panel } as any);
            component.onDetailsTouchMove({ touches: [{ clientY: 250 }], preventDefault: vi.fn(), currentTarget: panel } as any);

            component.onDetailsTouchEnd({ currentTarget: panel } as any);

            expect(component.isDetailsOpen()).toBe(false);
            expect(panel.style.transform).toBe('');
        });

        it('onDetailsTouchEnd_shouldKeepThePanelOpen_afterAShortSwipe', () => {
            const { panel } = panelWithList(0);
            component.isDetailsOpen.set(true);
            component.onDetailsTouchStart({ touches: [{ clientY: 100 }], currentTarget: panel, target: panel } as any);
            component.onDetailsTouchMove({ touches: [{ clientY: 150 }], preventDefault: vi.fn(), currentTarget: panel } as any);

            component.onDetailsTouchEnd({ currentTarget: panel } as any);

            expect(component.isDetailsOpen()).toBe(true);
        });

        it('onDetailsTouchCancel_shouldPutThePanelBack', () => {
            const { panel } = panelWithList(0);
            component.onDetailsTouchStart({ touches: [{ clientY: 100 }], currentTarget: panel, target: panel } as any);
            component.onDetailsTouchMove({ touches: [{ clientY: 160 }], preventDefault: vi.fn(), currentTarget: panel } as any);
            expect(panel.style.transform).toBe('translateY(60px)');

            component.onDetailsTouchCancel({ currentTarget: panel } as any);

            expect(panel.style.transform).toBe('');
            expect(component['isDragging']).toBe(false);
        });
    });
    /**
     * Characterisation tests for the popover geometry, written before refactoring
     * calculatePopoverPosition and kept afterwards. They pin what the function produces
     * rather than how it produces it: the signals it writes, for each view mode and each
     * side of the grid. Nothing covered this before, and it is the most intricate function
     * in the component.
     */
    describe('month cell events', () => {
        const at = (hour: number, title: string) => ({
            id: title, title, time: '', description: '',
            startDate: new Date(new Date().setHours(hour, 0, 0, 0)),
            endDate: new Date(new Date().setHours(hour + 1, 0, 0, 0)),
        });

        it('names the events of a day, earliest first', () => {
            component.events.set([at(15, 'Soirée jeux'), at(9, 'Point hebdo')]);

            const titles = component.monthCellEvents(new Date()).map(e => e.title);
            expect(titles).toEqual(['Point hebdo', 'Soirée jeux']);
        });

        it('names at most three and counts the rest', () => {
            component.events.set([at(8, 'A'), at(9, 'B'), at(10, 'C'), at(11, 'D'), at(12, 'E')]);

            expect(component.monthCellEvents(new Date())).toHaveLength(3);
            expect(component.hiddenEventCount(new Date())).toBe(2);
        });

        it('counts nothing when they all fit', () => {
            component.events.set([at(8, 'A'), at(9, 'B')]);

            expect(component.hiddenEventCount(new Date())).toBe(0);
        });
    });

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

        it('centres the popover on a phone held sideways, too short to anchor it', () => {
            Object.defineProperty(window, 'innerWidth', { value: 844, configurable: true });
            Object.defineProperty(window, 'innerHeight', { value: 390, configurable: true });
            stubDom(rect(0, 0, 844, 390), []);

            place(click(100, 200), component.days()[10].date);

            expect(component.isMobilePopover()).toBe(true);
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
            component.selectionDate.set(component.days()[3].date);
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
            component.selectionDate.set(null);
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

    describe('multi-day selection', () => {
        const monday = new Date(2026, 9, 12);
        const tuesday = new Date(2026, 9, 13);
        const wednesday = new Date(2026, 9, 14);

        const dragFrom = (day: Date, hour: number) => {
            component.isSelectingRange.set(true);
            component.selectionDate.set(day);
            component.selectionEndDate.set(day);
            component.selectionStartHour.set(hour);
            component.selectionEndHour.set(hour + 0.5);
        };

        it('selectionRange_shouldRunContinuouslyAcrossDays_whenDraggedToALaterDay', () => {
            dragFrom(monday, 18);
            component.onTimeMouseEnter(10, wednesday);

            expect(component.selectionRange()).toEqual({
                start: new Date(2026, 9, 12, 18),
                end: new Date(2026, 9, 14, 10)
            });
        });

        it('selectionRange_shouldOrderTheBounds_whenDraggedBackwards', () => {
            dragFrom(tuesday, 9);
            component.onTimeMouseEnter(14, monday);

            expect(component.selectionRange()).toEqual({
                start: new Date(2026, 9, 12, 14),
                end: new Date(2026, 9, 13, 9)
            });
        });

        it('selectionRange_shouldBeNull_whenNothingIsDragged', () => {
            expect(component.selectionRange()).toBeNull();
        });

        it('getSelectionStyle_shouldCoverOnlyThePartOfTheRangeOnEachDay', () => {
            dragFrom(monday, 18);
            component.onTimeMouseEnter(10, wednesday);
            const hourHeight = window.innerWidth <= 768 ? 60 : 80;

            expect(component.getSelectionStyle(monday)).toEqual({
                display: 'block', top: `${18 * hourHeight}px`, height: `${6 * hourHeight}px`
            });
            expect(component.getSelectionStyle(tuesday)).toEqual({
                display: 'block', top: '0px', height: `${24 * hourHeight}px`
            });
            expect(component.getSelectionStyle(wednesday)).toEqual({
                display: 'block', top: '0px', height: `${10 * hourHeight}px`
            });
        });

        it('getSelectionStyle_shouldHideDaysOutsideTheRange', () => {
            dragFrom(monday, 9);
            component.onTimeMouseEnter(12, monday);

            expect(component.getSelectionStyle(tuesday)).toEqual({ display: 'none' });
        });

        it('onTimeMouseUp_shouldOpenTheEventFormOnTheWholeRange', () => {
            const spy = vi.spyOn(component, 'startCreatingEvent').mockImplementation(() => undefined);
            dragFrom(monday, 18);
            component.onTimeMouseEnter(10, wednesday);

            component.onTimeMouseUp(new MouseEvent('mouseup'));

            expect(spy).toHaveBeenCalledWith(expect.anything(), undefined,
                new Date(2026, 9, 12, 18), new Date(2026, 9, 14, 10));
        });
    });

    describe('friend overlay', () => {
        const monday = new Date(2026, 9, 12);
        const getFriendCalendar = () => eventServiceMock.getFriendCalendar as ReturnType<typeof vi.fn>;
        const findFreeSlots = () => eventServiceMock.findFreeSlots as ReturnType<typeof vi.fn>;
        const entry = (start: Date, end: Date, title: string | null = null) =>
            ({ start, end, eventId: null, title, location: null, description: null });

        const showWeekOf = (day: Date) => {
            component.currentDate.set(day);
            component.toggleView('week');
            fixture.detectChanges();
        };
        const overlay = (...friendIds: string[]) => {
            component.onOverlayFriendsChange(friendIds);
            fixture.detectChanges();
        };

        it('ngOnInit_shouldLoadTheFriendsThatCanBeOverlaid', () => {
            expect(component.friendships()).toEqual(friendships);
        });

        it('ngOnInit_shouldKeepTheBarHidden_whenFriendshipsCannotBeLoaded', () => {
            socialServiceMock.listFriendships.mockReturnValue(throwError(() => new Error('down')));
            const other = TestBed.createComponent(CalendarComponent);
            other.detectChanges();

            expect(other.componentInstance.friendships()).toEqual([]);
        });

        it('fetchOverlay_shouldAskEachFriendsCalendarAndTheCommonFreeTimeForTheVisibleWeek', () => {
            showWeekOf(monday);

            overlay('lea', 'hugo');

            const from = new Date(2026, 9, 12);
            const to = new Date(2026, 9, 19);
            expect(getFriendCalendar()).toHaveBeenCalledWith('lea', from, to);
            expect(getFriendCalendar()).toHaveBeenCalledWith('hugo', from, to);
            expect(findFreeSlots()).toHaveBeenCalledWith({ friendIds: ['lea', 'hugo'], start: from, end: to, durationMinutes: 30 });
        });

        const showMonthOf = (day: Date) => {
            component.currentDate.set(day);
            component.toggleView('month');
            fixture.detectChanges();
        };

        it('fetchOverlay_shouldCoverTheWholeMonthGrid_inMonthView', () => {
            showMonthOf(new Date(2026, 9, 1));

            overlay('lea');

            // October 2026 starts on a Thursday: the grid runs from Monday 28 September, six weeks.
            const from = new Date(2026, 8, 28);
            const to = new Date(2026, 10, 9);
            expect(getFriendCalendar()).toHaveBeenCalledWith('lea', from, to);
            expect(findFreeSlots()).toHaveBeenCalledWith({ friendIds: ['lea'], start: from, end: to, durationMinutes: 30 });
        });

        it('summaryFor_shouldGiveEachMonthCellTheLoadsAndTheCommonFreeStretch', () => {
            getFriendCalendar().mockReturnValue(of([entry(new Date(2026, 9, 14, 8), new Date(2026, 9, 14, 13))]));
            findFreeSlots().mockReturnValue(of([{ start: new Date(2026, 9, 14, 19), end: new Date(2026, 9, 15, 8) }]));
            showMonthOf(new Date(2026, 9, 1));

            overlay('lea');

            const summary = component.summaryFor(new Date(2026, 9, 14));
            expect(summary?.loads.map(load => [load.friendName, load.ratio])).toEqual([['lea', 5 / 15]]);
            expect(summary?.commonFree).toEqual({ start: new Date(2026, 9, 14, 19), end: new Date(2026, 9, 14, 23) });
            expect(fixture.nativeElement.querySelectorAll('app-month-day-overlay').length).toBe(42);
            expect(fixture.nativeElement.querySelectorAll('.free-pill').length).toBe(1);
        });

        it('summaryFor_shouldBeNull_withoutOverlaidFriends', () => {
            showMonthOf(new Date(2026, 9, 1));

            expect(component.summaryFor(new Date(2026, 9, 14))).toBeNull();
            expect(fixture.nativeElement.querySelector('app-month-day-overlay')).toBeNull();
        });

        it('overlayFor_shouldBeEmpty_inMonthView', () => {
            getFriendCalendar().mockReturnValue(of([entry(new Date(2026, 9, 14, 8), new Date(2026, 9, 14, 13))]));
            showMonthOf(new Date(2026, 9, 1));

            overlay('lea');

            expect(component.overlayFor(new Date(2026, 9, 14))).toEqual({ blocks: [], free: [] });
        });

        it('openDay_shouldShowThatDayInDayView', () => {
            showMonthOf(new Date(2026, 9, 1));

            component.openDay(new Date(2026, 9, 14));

            expect(component.viewMode()).toBe('day');
            expect(component.days().map(day => day.date)).toEqual([new Date(2026, 9, 14)]);
        });

        it('overlayFor_shouldOnlyShowTheCommonFreeTimeBetweenEightAndEleven', () => {
            findFreeSlots().mockReturnValue(of([{ start: new Date(2026, 9, 13, 23), end: new Date(2026, 9, 14, 10) }]));
            showWeekOf(monday);

            overlay('lea');

            const hourHeight = window.innerWidth <= 768 ? 60 : 80;
            expect(component.overlayFor(new Date(2026, 9, 14)).free).toEqual([{ top: 8 * hourHeight, height: 2 * hourHeight }]);
            expect(component.overlayFor(new Date(2026, 9, 13)).free).toEqual([]);
        });

        it('fetchOverlay_shouldNotRefetch_whenTheSameWeekIsRebuilt', () => {
            showWeekOf(monday);
            overlay('lea');

            component.generateCalendar();
            fixture.detectChanges();

            expect(getFriendCalendar()).toHaveBeenCalledTimes(1);
        });

        it('onOverlayFriendsChange_shouldKeepAtMostFourFriends', () => {
            component.onOverlayFriendsChange(['a', 'b', 'c', 'd', 'e']);

            expect(component.overlayFriendIds()).toEqual(['a', 'b', 'c', 'd']);
        });

        it('overlayColors_shouldFollowTheMentionOrder', () => {
            component.onOverlayFriendsChange(['hugo', 'lea']);

            expect([...component.overlayColors().keys()]).toEqual(['hugo', 'lea']);
            expect(component.overlayColors().get('hugo')).not.toBe(component.overlayColors().get('lea'));
        });

        it('overlayFor_shouldLayEachFriendInTheirLaneAndTheCommonFreeTimeAcross', () => {
            getFriendCalendar().mockImplementation((friendId: string) => of(friendId === 'lea'
                ? [entry(new Date(2026, 9, 14, 18), new Date(2026, 9, 14, 20), 'Poterie')]
                : [entry(new Date(2026, 9, 14, 18), new Date(2026, 9, 14, 19))]));
            findFreeSlots().mockReturnValue(of([{ start: new Date(2026, 9, 14, 20), end: new Date(2026, 9, 14, 23) }]));
            showWeekOf(monday);

            overlay('lea', 'hugo');

            const wednesday = component.overlayFor(new Date(2026, 9, 14));
            expect(wednesday.blocks.map(b => [b.friendName, b.left, b.width, b.title])).toEqual([
                ['lea', 0, 50, 'Poterie'],
                ['hugo', 50, 50, null]
            ]);
            expect(wednesday.free).toHaveLength(1);
            expect(component.overlayFor(new Date(2026, 9, 13))).toEqual({ blocks: [], free: [] });
        });

        it('template_shouldDrawTheLanesAndFreeBandsInTheColumns', () => {
            getFriendCalendar().mockReturnValue(of([entry(new Date(2026, 9, 14, 18), new Date(2026, 9, 14, 20), 'Poterie')]));
            findFreeSlots().mockReturnValue(of([{ start: new Date(2026, 9, 14, 20), end: new Date(2026, 9, 14, 23) }]));
            showWeekOf(monday);

            overlay('lea');

            expect(fixture.nativeElement.querySelectorAll('.friend-block').length).toBe(1);
            expect(fixture.nativeElement.querySelectorAll('.free-band').length).toBe(1);
            expect(fixture.nativeElement.querySelector('app-friend-overlay-bar')).not.toBeNull();
        });

        it('overlayError_shouldNameTheFriendWhoseCalendarFailed_andKeepTheOthers', () => {
            getFriendCalendar().mockImplementation((friendId: string) => friendId === 'hugo'
                ? throwError(() => new Error('403'))
                : of([entry(new Date(2026, 9, 14, 18), new Date(2026, 9, 14, 20), 'Poterie')]));
            showWeekOf(monday);

            overlay('lea', 'hugo');

            expect(component.overlayError()).toBe('Impossible de charger le calendrier de hugo.');
            expect(component.overlayFor(new Date(2026, 9, 14)).blocks.map(b => b.friendName)).toEqual(['lea']);
        });

        it('overlayError_shouldSay_whenTheCommonFreeTimeCannotBeComputed', () => {
            findFreeSlots().mockReturnValue(throwError(() => new Error('502')));
            showWeekOf(monday);

            overlay('lea');

            expect(component.overlayError()).toContain('créneaux communs');
        });

        it('onOverlayFriendsChange_shouldClearTheOverlay_whenEveryoneIsRemoved', () => {
            getFriendCalendar().mockReturnValue(of([entry(new Date(2026, 9, 14, 18), new Date(2026, 9, 14, 20))]));
            showWeekOf(monday);
            overlay('lea');

            overlay();

            expect(component.overlayFor(new Date(2026, 9, 14))).toEqual({ blocks: [], free: [] });
            expect(component.overlayError()).toBeNull();
        });
    });

    describe('event index', () => {
        const event = (id: string, start: Date, hours = 1): CalendarEvent => ({
            id, title: id, time: '', description: '', startDate: start,
            endDate: new Date(start.getTime() + hours * 3_600_000)
        });

        beforeEach(() => {
            component.events.set([
                event('late', new Date(2026, 9, 14, 18, 30)),
                event('early', new Date(2026, 9, 14, 9)),
                event('also-nine', new Date(2026, 9, 14, 9, 45)),
                event('next-day', new Date(2026, 9, 15, 9))
            ]);
        });

        it('getEventsForDay_shouldListTheDaysEventsEarliestFirst', () => {
            expect(component.getEventsForDay(new Date(2026, 9, 14)).map(e => e.id)).toEqual(['early', 'also-nine', 'late']);
        });

        it('getEventsForHour_shouldKeepOnlyEventsStartingInThatHour', () => {
            expect(component.getEventsForHour(new Date(2026, 9, 14), 9).map(e => e.id)).toEqual(['early', 'also-nine']);
            expect(component.getEventsForHour(new Date(2026, 9, 14), 10)).toEqual([]);
        });

        it('getEventsForHour_shouldReturnTheSameArray_untilTheEventsChange', () => {
            // What spares @for a diff on each of the 168 cells at every change detection.
            const first = component.getEventsForHour(new Date(2026, 9, 14), 9);
            expect(component.getEventsForHour(new Date(2026, 9, 14), 9)).toBe(first);
            expect(component.getEventsForHour(new Date(2026, 9, 14), 3)).toBe(component.getEventsForHour(new Date(2026, 9, 16), 3));

            component.events.set([event('other', new Date(2026, 9, 14, 9))]);

            expect(component.getEventsForHour(new Date(2026, 9, 14), 9)).not.toBe(first);
            expect(component.getEventsForHour(new Date(2026, 9, 14), 9).map(e => e.id)).toEqual(['other']);
        });

        it('monthCellEvents_shouldNameAtMostThree_andCountTheRest', () => {
            component.events.update(events => [...events, event('fourth', new Date(2026, 9, 14, 21))]);

            expect(component.monthCellEvents(new Date(2026, 9, 14)).map(e => e.id)).toEqual(['early', 'also-nine', 'late']);
            expect(component.hiddenEventCount(new Date(2026, 9, 14))).toBe(1);
        });
    });

    describe('hold to select', () => {
        it('onTimeMouseDown_shouldShowTheSelectionWhenTheHoldCompletes_withoutAnotherEvent', () => {
            component.toggleView('week');
            fixture.detectChanges();
            vi.useFakeTimers();
            try {
                const day = component.days()[2].date;
                const press = new MouseEvent('mousedown', { clientX: 10, clientY: 0 });
                Object.defineProperty(press, 'currentTarget', { value: { getBoundingClientRect: () => ({ top: 0, height: 80 }) } });

                component.onTimeMouseDown(press, day, 9);
                vi.advanceTimersByTime(500);

                // Read straight from the signals the template binds: no pointer move needed.
                expect(component.isSelectingRange()).toBe(true);
                expect(component.getSelectionStyle(day)).toMatchObject({ display: 'block' });
            } finally {
                vi.useRealTimers();
            }
        });
    });

    describe('mobile touch', () => {
        const day = () => component.days()[10];
        const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }], cancelable: false } as unknown as TouchEvent);

        afterEach(() => vi.useRealTimers());

        it('onMonthDayTouchMove_shouldTreatAMovingFingerAsAScroll_notAHold', () => {
            vi.useFakeTimers();
            const open = vi.spyOn(component, 'startCreatingEvent').mockImplementation(() => undefined);
            component.onMonthDayMouseDown(touch(100, 100), day());

            component.onMonthDayTouchMove(touch(100, 140));
            vi.advanceTimersByTime(1000);

            expect(open).not.toHaveBeenCalled();
        });

        it('onMonthDayTouchMove_shouldKeepTheHold_whenTheFingerBarelyMoves', () => {
            vi.useFakeTimers();
            const open = vi.spyOn(component, 'startCreatingEvent').mockImplementation(() => undefined);
            component.onMonthDayMouseDown(touch(100, 100), day());

            component.onMonthDayTouchMove(touch(103, 104));
            vi.advanceTimersByTime(1000);

            expect(open).toHaveBeenCalled();
        });

        it('onPopoverBackdropClick_shouldIgnoreTheClickOfTheFingerThatOpenedIt', () => {
            vi.useFakeTimers();
            component.isPopoverVisible.set(true);
            (component as unknown as { popoverOpenedAt: number }).popoverOpenedAt = Date.now();

            component.onPopoverBackdropClick();
            expect(component.isPopoverVisible()).toBe(true);

            vi.advanceTimersByTime(600);
            component.onPopoverBackdropClick();
            expect(component.isPopoverVisible()).toBe(false);
        });

        it('onTimeTouchCancel_shouldDropAHalfMadeSelection', () => {
            component.isSelectingRange.set(true);
            component.selectionDate.set(new Date(2026, 9, 14));
            component.selectionStartHour.set(9);
            component.selectionEndHour.set(10);

            component.onTimeTouchCancel();

            expect(component.isSelectingRange()).toBe(false);
            expect(component.selectionRange()).toBeNull();
        });

        it('onTimeTouchCancel_shouldStopAPendingHold', () => {
            vi.useFakeTimers();
            component.toggleView('week');
            const press = new MouseEvent('mousedown', { clientX: 10, clientY: 0 });
            Object.defineProperty(press, 'currentTarget', { value: { getBoundingClientRect: () => ({ top: 0, height: 80 }) } });
            component.onTimeMouseDown(press, component.days()[2].date, 9);

            component.onTimeTouchCancel();
            vi.advanceTimersByTime(1000);

            expect(component.isSelectingRange()).toBe(false);
        });

        it('cancelCreatingEvent_shouldEndASelectionInProgress', () => {
            component.isSelectingRange.set(true);

            component.cancelCreatingEvent();

            expect(component.isSelectingRange()).toBe(false);
        });
    });

    describe('French display', () => {
        it('weekDays_shouldBeFrench_mondayFirst', () => {
            expect(component.weekDays).toEqual(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']);
        });

        it('formatTimeRange_shouldUseThe24HourClock', () => {
            const format = (component as unknown as { formatTimeRange: (a: Date, b: Date) => string }).formatTimeRange;

            expect(format(new Date(2026, 9, 14, 9, 5), new Date(2026, 9, 14, 14, 30))).toBe('09:05 – 14:30');
        });

        it('startCreatingEvent_shouldLeaveTheTitleEmpty_forThePlaceholderToShow', () => {
            component.startCreatingEvent(new MouseEvent('click'), new Date(2026, 9, 14));

            expect(component.popoverData().title).toBe('');
        });
    });

});

