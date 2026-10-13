import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CalendarComponent, CalendarEvent, defaultStart } from './calendar';
import { NotificationService } from '../../services/notification.service';
import { BreakpointObserver } from '@angular/cdk/layout';
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
    let notificationsMock: { showAction: ReturnType<typeof vi.fn> };
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
        notificationsMock = { showAction: vi.fn() };

        await TestBed.configureTestingModule({
            imports: [CalendarComponent, NoopAnimationsModule],
            providers: [
                { provide: EventService, useValue: eventServiceMock },
                { provide: SocialService, useValue: socialServiceMock },
                { provide: NotificationService, useValue: notificationsMock },
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
                end: new Date(2026, 9, 14, 11)
            });
        });

        it('onTimeMouseEnter_shouldCoverTheWholeHourUnderThePointer', () => {
            dragFrom(monday, 9.25);
            component.onTimeMouseEnter(11, monday);

            expect(component.selectionRange()).toEqual({
                start: new Date(2026, 9, 12, 9, 15),
                end: new Date(2026, 9, 12, 12)
            });
        });

        it('onTimeMouseEnter_shouldEndAtTheHourOfTheStart_whenBackInItsCell', () => {
            dragFrom(monday, 9.25);
            component.onTimeMouseEnter(11, monday);
            component.onTimeMouseEnter(9, monday);

            expect(component.selectionRange()?.end).toEqual(new Date(2026, 9, 12, 10));
        });

        it('onTimeMouseEnter_shouldDoNothing_withoutASelection', () => {
            component.onTimeMouseEnter(11, monday);

            expect(component.selectionRange()).toBeNull();
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
                display: 'block', top: '0px', height: `${11 * hourHeight}px`
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

            expect(spy).toHaveBeenCalledWith(undefined,
                new Date(2026, 9, 12, 18), new Date(2026, 9, 14, 11));
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
            const third = 100 / 3;
            expect(wednesday.blocks.map(b => [b.friendName, b.left, b.width, b.title])).toEqual([
                ['lea', third, third, 'Poterie'],
                ['hugo', 2 * third, third, null]
            ]);
            expect(component.ownLaneWidth()).toBe(third);
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

        it('ownLaneWidth_shouldBeTheWholeColumn_withoutOverlaidFriends', () => {
            showWeekOf(monday);

            expect(component.ownLaneWidth()).toBe(100);
        });

        it('template_shouldNarrowTheUsersEventsToTheirLane', () => {
            showWeekOf(monday);
            overlay('lea');

            const container: HTMLElement = fixture.nativeElement.querySelector('.event-container');
            expect(container.style.width).toBe('50%');
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

    describe('click or drag to create', () => {
        const press = (y = 0, target?: Element) => {
            const event = new MouseEvent('mousedown', { clientX: 10, clientY: y, button: 0 });
            Object.defineProperty(event, 'currentTarget', { value: { getBoundingClientRect: () => ({ top: 0, height: 80 }) } });
            if (target) {
                Object.defineProperty(event, 'target', { value: target });
            }
            return event;
        };

        beforeEach(() => {
            component.toggleView('week');
            fixture.detectChanges();
        });

        it('onTimeMouseDown_shouldStartTheSelectionAtOnce_withAMouse', () => {
            const day = component.days()[2].date;

            component.onTimeMouseDown(press(), day, 9);

            expect(component.isSelectingRange()).toBe(true);
            expect(component.getSelectionStyle(day)).toMatchObject({ display: 'block' });
        });

        it('onTimeMouseUp_shouldOpenAOneHourEvent_afterAPlainClick', () => {
            const open = vi.spyOn(component, 'startCreatingEvent').mockImplementation(() => undefined);
            const day = component.days()[2].date;

            component.onTimeMouseDown(press(40), day, 9);
            component.onTimeMouseUp(new MouseEvent('mouseup'));

            const start = new Date(day);
            start.setHours(9, 30, 0, 0);
            expect(open).toHaveBeenCalledWith(undefined, start, new Date(start.getTime() + 3600000));
        });

        it('onTimeMouseDown_shouldSnapDownToTheQuarterUnderThePointer', () => {
            const day = component.days()[2].date;

            component.onTimeMouseDown(press(79), day, 9);

            expect(component.selectionStartHour()).toBe(9.75);
        });

        it('onTimeMouseDown_shouldLeaveAPressOnAnEventToThatEvent', () => {
            const card = document.createElement('div');
            card.className = 'inline-event-card';

            component.onTimeMouseDown(press(0, card), component.days()[2].date, 9);

            expect(component.isSelectingRange()).toBe(false);
        });

        it('onTimeMouseDown_shouldIgnoreTheRightButton', () => {
            const event = new MouseEvent('mousedown', { button: 2 });

            component.onTimeMouseDown(event, component.days()[2].date, 9);

            expect(component.isSelectingRange()).toBe(false);
        });
    });

    describe('mobile touch', () => {
        const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }], cancelable: false } as unknown as TouchEvent);

        afterEach(() => vi.useRealTimers());

        const finger = (y = 0) => ({
            touches: [{ clientX: 10, clientY: y }],
            changedTouches: [{ clientX: 10, clientY: y }],
            currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 80 }) },
            target: null,
            cancelable: false
        } as unknown as TouchEvent);
        const weekDay = () => {
            component.toggleView('week');
            fixture.detectChanges();
            return component.days()[2].date;
        };

        it('onTimeMouseUp_shouldOpenAOneHourEvent_afterATap', () => {
            const day = weekDay();
            vi.useFakeTimers();
            const open = vi.spyOn(component, 'startCreatingEvent').mockImplementation(() => undefined);

            component.onTimeMouseDown(finger(), day, 14);
            vi.advanceTimersByTime(100);
            component.onTimeMouseUp(finger());

            const start = new Date(day);
            start.setHours(14, 0, 0, 0);
            expect(open).toHaveBeenCalledWith(undefined, start, new Date(start.getTime() + 3600000));
        });

        it('onTouchMove_shouldTreatAMovingFingerAsAScroll_notATap', () => {
            const day = weekDay();
            vi.useFakeTimers();
            const open = vi.spyOn(component, 'startCreatingEvent').mockImplementation(() => undefined);

            component.onTimeMouseDown(finger(100), day, 14);
            component.onTouchMove(touch(10, 140));
            component.onTimeMouseUp(finger(140));
            vi.advanceTimersByTime(1000);

            expect(open).not.toHaveBeenCalled();
            expect(component.isSelectingRange()).toBe(false);
        });

        it('onTimeMouseDown_shouldStartADragAfterAHold_onTouch', () => {
            const day = weekDay();
            vi.useFakeTimers();
            component.onTimeMouseDown(finger(), day, 14);

            expect(component.isSelectingRange()).toBe(false);
            vi.advanceTimersByTime(500);
            expect(component.isSelectingRange()).toBe(true);
        });

        it('onTimeMouseDown_shouldIgnoreTheMouseEventsEmulatedAfterATouch', () => {
            const day = weekDay();
            vi.useFakeTimers();
            const open = vi.spyOn(component, 'startCreatingEvent').mockImplementation(() => undefined);
            component.onTimeMouseDown(finger(), day, 14);
            component.onTimeMouseUp(finger());
            open.mockClear();
            component.isPopoverVisible.set(false);

            const emulated = new MouseEvent('mousedown', { button: 0 });
            Object.defineProperty(emulated, 'currentTarget', { value: { getBoundingClientRect: () => ({ top: 0, height: 80 }) } });
            component.onTimeMouseDown(emulated, day, 14);

            expect(component.isSelectingRange()).toBe(false);
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
            const day = weekDay();
            vi.useFakeTimers();
            component.onTimeMouseDown(finger(), day, 9);

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
            component.startCreatingEvent(new Date(2026, 9, 14));

            expect(component.popoverData().title).toBe('');
        });
    });

    describe('new event button', () => {
        const now = new Date(2026, 9, 14, 15, 20);

        it('defaultStart_shouldBeTheNextFullHour_today', () => {
            expect(defaultStart(new Date(2026, 9, 14), now)).toEqual(new Date(2026, 9, 14, 16));
        });

        it('defaultStart_shouldStopAt23h_lateAtNight', () => {
            expect(defaultStart(new Date(2026, 9, 14), new Date(2026, 9, 14, 23, 40))).toEqual(new Date(2026, 9, 14, 23));
        });

        it('defaultStart_shouldBeTheEvening_onAnotherDay', () => {
            expect(defaultStart(new Date(2026, 9, 20, 9), now)).toEqual(new Date(2026, 9, 20, 18));
        });

        it('openNewEvent_shouldOpenAOneHourForm', () => {
            component.openNewEvent(new Date(2030, 0, 10));

            expect(component.isPopoverVisible()).toBe(true);
            expect(component.popoverData().startDate).toEqual(new Date(2030, 0, 10, 18));
            expect(component.popoverData().endDate).toEqual(new Date(2030, 0, 10, 19));
        });

        it('openNewEvent_shouldUseTheDayShown_inDayView', () => {
            component.currentDate.set(new Date(2030, 0, 10));
            component.toggleView('day');

            component.openNewEvent();

            expect(component.popoverData().startDate).toEqual(new Date(2030, 0, 10, 18));
        });

        it('openNewEvent_shouldUseTheFirstDayOfTheMonth_whenTodayIsNotShown', () => {
            component.currentDate.set(new Date(2030, 4, 1));
            component.generateCalendar();

            component.openNewEvent();

            expect(component.popoverData().startDate).toEqual(new Date(2030, 4, 1, 18));
        });

        it('openNewEvent_shouldUseToday_whenItIsShown', () => {
            component.openNewEvent();

            expect(component.isSameDate(component.popoverData().startDate, new Date())).toBe(true);
        });

        it('template_shouldOfferTheButtonInTheHeader_andOnPhones', () => {
            const el: HTMLElement = fixture.nativeElement;

            expect(el.querySelector('.new-event-btn')?.textContent).toContain('Nouvel événement');
            expect(el.querySelector('.new-event-fab')).not.toBeNull();
        });

        it('template_shouldOfferToAddAnEventFromTheDayPanel', () => {
            const day = { date: new Date(2030, 0, 10), isToday: false, isCurrentMonth: true, hasEvents: false };
            component.selectDate(day);
            fixture.detectChanges();
            const open = vi.spyOn(component, 'openNewEvent');

            (fixture.nativeElement.querySelector('.add-on-day') as HTMLButtonElement).click();

            expect(open).toHaveBeenCalledWith(new Date(2030, 0, 10));
        });

        it('onEscape_shouldCloseTheFormFirst', () => {
            component.isDetailsOpen.set(true);
            component.openNewEvent(new Date(2030, 0, 10));
            component.isDetailsOpen.set(true);

            component.onEscape();

            expect(component.isPopoverVisible()).toBe(false);
            expect(component.isDetailsOpen()).toBe(true);
        });
    });

    describe('saving a new event', () => {
        const data: EventCreateRequest = { title: 'Afterwork', startDate: new Date(2030, 0, 10, 18), subscribeByDefault: false, location: '' };

        beforeEach(() => {
            try { localStorage.removeItem('wely.calendar.createHintDone'); } catch { /* no storage */ }
        });

        it('submitEvent_shouldCloseTheForm_andOfferToOpenTheEvent', () => {
            component.openNewEvent(new Date(2030, 0, 10));

            component.submitEvent(data);

            expect(component.isPopoverVisible()).toBe(false);
            expect(notificationsMock.showAction).toHaveBeenCalledWith('Événement créé', 'Voir', expect.any(Function));
            notificationsMock.showAction.mock.calls[0][2]();
            expect(routerMock.navigate).toHaveBeenCalledWith(['/event', '101']);
        });

        it('submitEvent_shouldKeepTheFormOpenWithAMessage_whenItFails', () => {
            (eventServiceMock.createEvent as ReturnType<typeof vi.fn>).mockReturnValue(throwError(() => new Error('500')));
            component.openNewEvent(new Date(2030, 0, 10));

            component.submitEvent(data);

            expect(component.isPopoverVisible()).toBe(true);
            expect(component.createError()).toContain('pas pu être créé');
            expect(component.savingEvent()).toBe(false);
        });

        it('submitEvent_shouldNotSendTwice_whileSaving', () => {
            const pending = new Subject<FeedEvent>();
            (eventServiceMock.createEvent as ReturnType<typeof vi.fn>).mockReturnValue(pending);

            component.submitEvent(data);
            component.submitEvent(data);

            expect(eventServiceMock.createEvent).toHaveBeenCalledTimes(1);
        });

        it('startCreatingEvent_shouldClearAnEarlierError', () => {
            component.createError.set('old');

            component.openNewEvent(new Date(2030, 0, 10));

            expect(component.createError()).toBeNull();
        });

        it('submitEvent_shouldRetireTheHint', () => {
            component.showCreateHint.set(true);

            component.submitEvent(data);

            expect(component.showCreateHint()).toBe(false);
        });

        it('dismissCreateHint_shouldHideItAndRememberIt', () => {
            component.dismissCreateHint();

            expect(component.showCreateHint()).toBe(false);
            expect(localStorage.getItem('wely.calendar.createHintDone')).toBe('1');
        });

        it('template_shouldShowTheHint_untilDismissed', () => {
            component.showCreateHint.set(true);
            fixture.detectChanges();
            expect(fixture.nativeElement.querySelector('.create-hint')).not.toBeNull();

            (fixture.nativeElement.querySelector('.create-hint button') as HTMLButtonElement).click();
            fixture.detectChanges();
            expect(fixture.nativeElement.querySelector('.create-hint')).toBeNull();
        });
    });

    describe('on a phone', () => {
        /** A fresh calendar whose breakpoint says phone, or not. */
        const phone = (on: boolean) => {
            TestBed.resetTestingModule();
            TestBed.configureTestingModule({
                imports: [CalendarComponent, NoopAnimationsModule],
                providers: [
                    { provide: EventService, useValue: eventServiceMock },
                    { provide: SocialService, useValue: socialServiceMock },
                    { provide: NotificationService, useValue: notificationsMock },
                    { provide: Router, useValue: routerMock },
                    { provide: BreakpointObserver, useValue: { observe: () => of({ matches: on, breakpoints: {} }) } }
                ]
            });
            fixture = TestBed.createComponent(CalendarComponent);
            component = fixture.componentInstance;
            fixture.detectChanges();
        };
        const swipe = (fromX: number, toX: number, dy = 0) => {
            component.onSwipeStart({ touches: [{ clientX: fromX, clientY: 100 }] } as unknown as TouchEvent);
            component.onSwipeEnd({ changedTouches: [{ clientX: toX, clientY: 100 + dy }] } as unknown as TouchEvent);
        };

        it('generateCalendar_shouldShowThreeDaysFromTheCurrentDate_inWeekView', () => {
            phone(true);
            component.currentDate.set(new Date(2030, 0, 10));
            component.viewMode.set('week');

            component.generateCalendar();

            expect(component.days().map(day => day.date.getDate())).toEqual([10, 11, 12]);
            expect(component.weekLabel()).toBe('3 jours');
        });

        it('navigate_shouldMoveThreeDaysAtATime', () => {
            phone(true);
            component.currentDate.set(new Date(2030, 0, 10));
            component.viewMode.set('week');

            component.navigate(1);

            expect(component.days()[0].date.getDate()).toBe(13);
        });

        it('toggleView_shouldStartTheThreeDaysToday_whenTodayIsInTheMonth', () => {
            phone(true);
            const today = new Date();
            component.currentDate.set(new Date(today.getFullYear(), today.getMonth(), 1));

            component.toggleView('week');

            expect(component.isSameDate(component.days()[0].date, today)).toBe(true);
        });

        it('generateCalendar_shouldKeepTheWholeWeek_onALargerScreen', () => {
            phone(false);
            component.currentDate.set(new Date(2030, 0, 10));
            component.viewMode.set('week');

            component.generateCalendar();

            expect(component.days()).toHaveLength(7);
            expect(component.weekLabel()).toBe('Semaine');
        });

        it('onSwipeEnd_shouldGoToTheNextPeriod_onASwipeLeft', () => {
            const month = component.currentDate().getMonth();

            swipe(300, 150);

            expect(component.currentDate().getMonth()).toBe((month + 1) % 12);
        });

        it('onSwipeEnd_shouldGoBack_onASwipeRight', () => {
            const month = component.currentDate().getMonth();

            swipe(100, 260);

            expect(component.currentDate().getMonth()).toBe((month + 11) % 12);
        });

        it('onSwipeEnd_shouldIgnoreAShortOrMostlyVerticalMove', () => {
            const before = component.currentDate().getTime();

            swipe(300, 270);
            swipe(300, 200, 120);

            expect(component.currentDate().getTime()).toBe(before);
        });

        it('onSwipeEnd_shouldIgnoreTheDragOfARange', () => {
            const before = component.currentDate().getTime();
            component.isSelectingRange.set(true);

            swipe(300, 100);

            expect(component.currentDate().getTime()).toBe(before);
        });

        it('onViewPicked_shouldSwitchTheView', () => {
            const select = document.createElement('select');
            select.innerHTML = '<option value="day">Jour</option>';
            select.value = 'day';

            component.onViewPicked({ target: select } as unknown as Event);

            expect(component.viewMode()).toBe('day');
        });
    });
});
