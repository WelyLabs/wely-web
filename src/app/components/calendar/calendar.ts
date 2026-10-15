import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, OnDestroy, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { LoggerService } from '../../core/logging/logger.service';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Router } from '@angular/router';
import { EventService, FeedEvent, EventCreateRequest, FreeRange, FriendCalendarEntry } from '../../services/event.service';
import { SocialService } from '../../services/social.service';
import { NotificationService } from '../../services/notification.service';
import { ScheduleService } from '../../services/schedule.service';
import { FriendSummary } from '../../models/friendship.model';
import { readOutingProposal } from '../../core/ui/outing-proposal';

/** How often the now-line is repositioned. */
const TIME_MARKER_REFRESH_MS = 60000;

/** Converts the fractional part of an hour into minutes: the grid snaps to quarters. */
function minuteOf(hour: number): number {
  const fraction = hour % 1;
  if (fraction === 0.25) return 15;
  if (fraction === 0.5) return 30;
  if (fraction === 0.75) return 45;
  return 0;
}

const HOUR_MS = 3600000;

/** The given day at a fractional hour on the quarter-hour grid. */
function atHour(day: Date, hour: number): Date {
  const date = new Date(day);
  date.setHours(Math.floor(hour), minuteOf(hour), 0, 0);
  return date;
}

/** Midnight at the start of the given day. */
function startOfDay(day: Date): Date {
  const date = new Date(day);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Common free time shorter than this is not worth showing on the grid. */
const MIN_COMMON_FREE_MINUTES = 30;

/** What the overlay fetched for the visible days: each friend's calendar, and the common free time. */
interface OverlayData {
  calendars: { friendId: string; entries: FriendCalendarEntry[]; failed: boolean }[];
  /** Null when it could not be computed. */
  free: FreeRange[] | null;
}

const NO_OVERLAY: OverlayData = { calendars: [], free: [] };


/** Six rows of seven, so the month grid never changes height between months. */
const MONTH_GRID_CELLS = 42;
const DAYS_IN_WEEK = 7;
/** On a phone the week view shows this many days: seven did not fit and scrolled sideways. */
const DAYS_ON_PHONE = 3;
/** A horizontal swipe at least this long, and mostly horizontal, moves to the next period. */
const SWIPE_MIN_PX = 60;
const SWIPE_MAX_MS = 600;

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  hasEvents: boolean;
}

export interface CalendarEvent {
  id: string | number;
  title: string;
  time: string;
  description: string;
  startDate: Date;
  endDate: Date;
  /** One proposed slot of an open date poll, not a fixed event. */
  tentative?: boolean;
  /** For a tentative entry: which slot, so the event's several slots stay apart. */
  slotId?: string;
}

/** Fixed events as they are; each open poll as one tentative entry per proposed slot, polls deduplicated. */
export function toCalendarEvents(subscribed: FeedEvent[], polls: FeedEvent[]): CalendarEvent[] {
  const isOpenPoll = (event: FeedEvent) => event.poll?.status === 'OPEN';
  const openPolls = new Map([...subscribed, ...polls].filter(isOpenPoll).map(event => [event.id, event]));
  const fixed = subscribed.filter(event => !isOpenPoll(event)).map(event => toCalendarEvent(event, event.startDate, event.endDate));
  const tentative = [...openPolls.values()].flatMap(event => (event.poll?.slots ?? []).map(slot => ({
    ...toCalendarEvent(event, slot.start, slot.end),
    tentative: true,
    slotId: slot.id
  })));
  return [...fixed, ...tentative];
}

function toCalendarEvent(event: FeedEvent, start: Date, end: Date): CalendarEvent {
  return {
    id: event.id,
    title: event.title,
    time: formatTimeRange(start, end),
    description: event.description,
    startDate: new Date(start),
    endDate: new Date(end)
  };
}

/** 24-hour clock, as read in France. */
export function formatTimeRange(start: Date, end: Date): string {
  const format = (d: Date) => `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  return `${format(start)} – ${format(end)}`;
}

const POLL_INVALID_CODE = 'EVT-BUS-014';

import { QuickEventPopoverComponent } from '../quick-event-popover/quick-event-popover';
import { CalendarOverlayComponent } from '../calendar-overlay/calendar-overlay';
import { DayLayout, DaySummary, FriendLane, MAX_OVERLAID_FRIENDS, OVERLAY_COLORS, laneWidth, layoutDay, summarizeDay } from '../calendar-overlay/overlay-layout';
import { MonthDayOverlayComponent } from '../month-day-overlay/month-day-overlay';
import { FriendOverlayBarComponent } from '../friend-overlay-bar/friend-overlay-bar';

/** Shared empty result: a cell without events gets the same array every time, nothing to diff. */
const NO_EVENTS: CalendarEvent[] = [];

/** How many event titles a month cell names before it starts counting the rest. */
const MONTH_CELL_EVENTS = 3;

/** How far a finger may drift before a hold counts as a scroll. */
const TOUCH_SLOP_PX = 10;
/** A new event lasts an hour unless a range was dragged. */
const DEFAULT_EVENT_MINUTES = 60;
/** On a day other than today, a new event starts in the evening: when friends meet. */
const DEFAULT_START_HOUR = 18;
/** The latest hour a default start may fall on, so the hour after still ends that day. */
const LAST_START_HOUR = 23;
/**
 * How long after a touch the mouse events the browser emulates for it are ignored: a tap is
 * followed by a mousedown and a mouseup that would otherwise start a second selection.
 */
const COMPAT_MOUSE_GUARD_MS = 800;
/** Remembers that the "how to create an event" hint was seen. */
const CREATE_HINT_KEY = 'wely.calendar.createHintDone';

/**
 * Where a new event starts by default: the next full hour today, the evening any other day.
 */
export function defaultStart(day: Date, now = new Date()): Date {
  const start = startOfDay(day);
  if (start.toDateString() === now.toDateString()) {
    start.setHours(Math.min(now.getHours() + 1, LAST_START_HOUR));
  } else {
    start.setHours(DEFAULT_START_HOUR);
  }
  return start;
}

/** Storage can be missing or refused (private mode, blocked site data): the hint then just shows. */
function readHintDone(): boolean {
  try {
    return localStorage.getItem(CREATE_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeHintDone(): void {
  try {
    localStorage.setItem(CREATE_HINT_KEY, '1');
  } catch {
    // Not remembered: the hint shows again next time, nothing worse.
  }
}
/** How long after opening the popover ignores clicks on its backdrop. */
const POPOVER_CLICK_GUARD_MS = 500;


@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, FormsModule, QuickEventPopoverComponent, CalendarOverlayComponent, FriendOverlayBarComponent, MonthDayOverlayComponent],
  templateUrl: './calendar.html',
  // The ways in to a new event, and the phone layout, have their own sheets: the calendar's is at
  // its size budget.
  styleUrls: ['./calendar.scss', './calendar-create.scss', './calendar-phone.scss', './calendar-poll.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalendarComponent implements OnInit, OnDestroy {
  private readonly logger = inject(LoggerService);
  private readonly eventService = inject(EventService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly socialService = inject(SocialService);
  private readonly notifications = inject(NotificationService);
  private readonly schedule = inject(ScheduleService);

  readonly currentDate = signal(new Date());
  readonly days = signal<CalendarDay[]>([]);
  readonly weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  readonly hours = Array.from({ length: 24 }, (_, i) => i);
  readonly currentTimePosition = signal(0);
  /** The week (three days on a phone) by default: what a week holds is what people plan. */
  readonly viewMode = signal<'month' | 'week' | 'day'>('week');

  readonly selectedDate = signal<Date | null>(null);
  readonly selectedEvents = signal<CalendarEvent[]>([]);

  private timeUpdateInterval?: ReturnType<typeof setInterval>;

  // Popover state
  readonly isPopoverVisible = signal(false);
  readonly popoverData = signal<EventCreateRequest>({
    title: '',
    description: '',
    location: '',
    startDate: new Date(),
    endDate: new Date(),
  });

  /**
   * Whether the day panel is showing.
   *
   * <p>Not derived from {@link selectedDate}, tempting as that is: `startCreatingEvent` closes
   * the panel while keeping the selected date, because that date is what the new event is
   * anchored to.
   */
  readonly isDetailsOpen = signal(false);

  /** Whether the new event is being sent, and why the last attempt failed. */
  readonly savingEvent = signal(false);
  readonly createError = signal<string | null>(null);

  /** The one-line "how to create an event" hint, until the first event is created or it is closed. */
  readonly showCreateHint = signal(!readHintDone());

  /** When the popover last opened, for {@link onPopoverBackdropClick}. */
  private popoverOpenedAt = 0;

  // Touch event tracking
  private touchStartPos = { x: 0, y: 0 };

  /**
   * The events this user is subscribed to.
   *
   * <p>Three hardcoded ones — "Team Meeting", "Lunch with Client", "Code Review" — used to be
   * merged in here, repositioned onto today at every load, because wely-events models
   * subscriptions rather than a personal agenda and the week and day views had nothing to lay
   * out otherwise. They were demo data in production: an empty calendar is honest, a calendar
   * showing "Review PR #123" to every user is not.
   */
  readonly events = signal<CalendarEvent[]>([]);

  /** Friends whose calendar can be laid over the week or day view. */
  readonly friendships = signal<FriendSummary[]>([]);
  /** The friends laid over the grid, in the order they were mentioned, at most four. */
  readonly overlayFriendIds = signal<string[]>([]);
  /** Each overlaid friend's colour, by mention order: the lane and the chip share it. */
  readonly overlayColors = computed(() =>
    new Map(this.overlayFriendIds().map((id, index) => [id, OVERLAY_COLORS[index % OVERLAY_COLORS.length]])));

  /** Which friends, over which days: equal requests do not refetch when the days are merely rebuilt. */
  private readonly overlayRequest = computed(() => {
    const friendIds = this.overlayFriendIds();
    const days = this.days();
    if (friendIds.length === 0 || days.length === 0) {
      return null;
    }
    const from = startOfDay(days[0].date);
    const to = startOfDay(days[days.length - 1].date);
    to.setDate(to.getDate() + 1);
    return { friendIds, from, to };
  }, {
    equal: (a, b) => a === b || (!!a && !!b && a.friendIds.join() === b.friendIds.join()
      && a.from.getTime() === b.from.getTime() && a.to.getTime() === b.to.getTime())
  });

  /**
   * Every overlaid friend's calendar, one request each in parallel, and the time all of you have
   * free. One friend failing does not hide the others; switchMap drops an answer for a week
   * already left.
   */
  private readonly overlayData = toSignal(toObservable(this.overlayRequest).pipe(
    switchMap(request => request ? this.fetchOverlay(request.friendIds, request.from, request.to) : of(NO_OVERLAY))
  ), { initialValue: NO_OVERLAY });

  readonly overlayError = computed(() => {
    const data = this.overlayData();
    const failed = data.calendars.filter(calendar => calendar.failed).map(calendar => this.nameOf(calendar.friendId));
    if (failed.length > 0) {
      return `Impossible de charger le calendrier de ${failed.join(', ')}.`;
    }
    return data.free === null ? 'Les créneaux communs n\'ont pas pu être calculés.' : null;
  });

  /** One lane per overlaid friend, in mention order, with the entries fetched for them. */
  private readonly overlayLanes = computed<FriendLane[]>(() => {
    const colors = this.overlayColors();
    return this.overlayData().calendars.map(calendar => ({
      friendName: this.nameOf(calendar.friendId),
      color: colors.get(calendar.friendId) ?? OVERLAY_COLORS[0],
      periods: calendar.entries
    }));
  });

  /** Week and day views: each column's lanes and common free time, by `toDateString()`. */
  readonly dayLayouts = computed(() => {
    if (this.viewMode() === 'month') {
      return new Map<string, DayLayout>();
    }
    const lanes = this.overlayLanes();
    const free = this.overlayData().free ?? [];
    const hourHeight = this.hourHeight();
    return new Map(this.days().map(day => [day.date.toDateString(), layoutDay(day.date, lanes, free, hourHeight)]));
  });

  /** Week and day views: the share of each column the user's own events keep, beside the friends' lanes. */
  readonly ownLaneWidth = computed(() => this.viewMode() === 'month' ? 100 : laneWidth(this.overlayLanes().length));

  /** Month view: each cell's friend loads and common free stretch, by `toDateString()`. */
  readonly daySummaries = computed(() => {
    if (this.viewMode() !== 'month' || this.overlayFriendIds().length === 0) {
      return new Map<string, DaySummary>();
    }
    const lanes = this.overlayLanes();
    const free = this.overlayData().free ?? [];
    return new Map(this.days().map(day => [day.date.toDateString(), summarizeDay(day.date, lanes, free)]));
  });

  overlayFor(date: Date): DayLayout {
    return this.dayLayouts().get(date.toDateString()) ?? { blocks: [], free: [] };
  }

  summaryFor(date: Date): DaySummary | null {
    return this.daySummaries().get(date.toDateString()) ?? null;
  }

  /** From a month cell's free-together pill: that day, in day view, where the detail is. */
  openDay(date: Date): void {
    this.currentDate.set(new Date(date));
    this.selectedDate.set(new Date(date));
    this.toggleView('day');
  }

  onOverlayFriendsChange(friendIds: string[]): void {
    this.overlayFriendIds.set(friendIds.slice(0, MAX_OVERLAID_FRIENDS));
  }

  private fetchOverlay(friendIds: string[], from: Date, to: Date): Observable<OverlayData> {
    const calendars = forkJoin(friendIds.map(friendId =>
      this.eventService.getFriendCalendar(friendId, from, to).pipe(
        map(entries => ({ friendId, entries, failed: false })),
        catchError((err: unknown) => {
          this.logger.error('CalendarComponent', 'Could not load a friend calendar', err);
          return of({ friendId, entries: [], failed: true });
        }))));
    const free = this.eventService.findFreeSlots({
      friendIds, start: from, end: to, durationMinutes: MIN_COMMON_FREE_MINUTES
    }).pipe(catchError((err: unknown) => {
      this.logger.error('CalendarComponent', 'Could not compute the common free time', err);
      return of(null);
    }));
    return forkJoin({ calendars, free });
  }

  private nameOf(userId: string): string {
    return this.friendships().find(friend => friend.userId === userId)?.userName ?? 'un ami';
  }

  /**
   * Whether hour rows are the 60px phone ones. A signal, so that turning a phone across the
   * breakpoint (portrait 390px, landscape 844px) re-lays friends' blocks and the selection;
   * read straight from window.innerWidth, they kept the old row height and drifted by 25%.
   */
  private readonly compactRows = toSignal(
    inject(BreakpointObserver).observe('(max-width: 768px)').pipe(map(state => state.matches)),
    { initialValue: window.innerWidth <= 768 });

  /** Matches the hour rows of the stylesheet: 60px on a phone, 80px otherwise. */
  private hourHeight(): number {
    return this.compactRows() ? 60 : 80;
  }

  /** On a phone, « Semaine » is three days from the current date. */
  readonly onPhone = computed(() => this.compactRows());
  readonly weekLabel = computed(() => this.onPhone() ? '3 jours' : 'Semaine');

  /** Turning a phone across the breakpoint changes how many days the week view holds. */
  private readonly regenerateOnResize = effect(() => {
    this.compactRows();
    untracked(() => {
      if (this.days().length > 0) {
        this.generateCalendar();
      }
    });
  });

  private swipeStart: { x: number; y: number; at: number } | null = null;

  onSwipeStart(event: TouchEvent): void {
    const touch = event.touches[0];
    this.swipeStart = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY, at: Date.now() } : null;
  }

  /**
   * A quick horizontal swipe moves to the next or previous month, three days or day, like the
   * arrows. Not while a range is being dragged, which also moves a finger sideways.
   */
  onSwipeEnd(event: TouchEvent): void {
    const start = this.swipeStart;
    this.swipeStart = null;
    if (!start || this.isSelectingRange() || this.isPopoverVisible()) {
      return;
    }
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > 1.5 * Math.abs(dy) && Date.now() - start.at <= SWIPE_MAX_MS) {
      this.navigate(dx < 0 ? 1 : -1);
    }
  }

  /** The view picked in the phone's select. */
  onViewPicked(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'month' || value === 'week' || value === 'day') {
      this.toggleView(value);
    }
  }

  // Range selection, drag to create
  /**
   * Signals rather than plain fields: the hold-to-select timer sets them outside any event, and
   * only a signal makes that render. As fields, the selection appeared on the first finger move
   * after the hold rather than at the end of it — and without zone.js not even then.
   */
  readonly isSelectingRange = signal(false);
  readonly selectionStartHour = signal<number | null>(null);
  readonly selectionEndHour = signal<number | null>(null);
  readonly selectionDate = signal<Date | null>(null);
  /** Day under the pointer: a drag may cross columns, and the range runs continuously from one to the other. */
  readonly selectionEndDate = signal<Date | null>(null);
  private selectionTimeout?: ReturnType<typeof setTimeout>;
  private readonly SELECTION_DELAY = 400; // ms
  /** A touch that may still be a tap: released before the hold delay, it creates an event there. */
  private pendingTap: { date: Date; startHour: number } | null = null;
  /** When a finger last touched the grid, to ignore the mouse events emulated after it. */
  private lastTouchAt = 0;

  // Touch event tracking for swipe-to-dismiss
  private touchStartY = 0;
  private touchCurrentY = 0;
  private isDragging = false;

  ngOnInit(): void {
    // The load used to be triggered by the root-provided service's constructor: both requests
    // went out at bootstrap, including for a signed-out visitor on the landing page, where they
    // could only come back 401.
    this.eventService.refreshEvents();
    // The default week view opens on the current hour, as switching to it does.
    setTimeout(() => this.scrollToCurrentTime(), 100);

    // Open polls show as tentative slots: those subscribed to, plus those organized or voted on,
    // read again whenever the subscribed list is.
    this.eventService.subscribedEvents$.pipe(
      tap(feedEvents => {
        this.subscribedFeed = feedEvents;
        this.showEvents();
      }),
      switchMap(() => this.eventService.getMyPolls().pipe(catchError((err: unknown) => {
        this.logger.error('CalendarComponent', 'Could not load the open polls', err);
        return of(null);
      }))),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(polls => {
      if (polls) {
        this.pollFeed = polls;
        this.showEvents();
      }
    });

    // Started once, outside the subscription. It used to be created inside it, so every emission
    // of subscribedEvents$ started another interval and only the last handle was kept — the rest
    // ran until the tab closed, each one repainting the now-line every minute.
    // Only friends can be overlaid; without wely-social the picker simply stays hidden.
    this.socialService.listFriendships()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: friendships => this.friendships.set(friendships),
        error: (err: unknown) => this.logger.error('CalendarComponent', 'Could not load friendships', err)
      });

    this.updateTimePosition();
    this.timeUpdateInterval = setInterval(() => this.updateTimePosition(), TIME_MARKER_REFRESH_MS);
    this.openProposedOuting();
  }

  /** « Proposer une sortie » on a friend's page: opens the form as a poll on the slots it picked. */
  private openProposedOuting(): void {
    const proposal = readOutingProposal(history.state);
    if (!proposal) {
      return;
    }
    // Read once: going back or reloading must not open the form again.
    history.replaceState({ ...history.state, proposeSlots: undefined, proposeWith: undefined }, '');
    const title = `Sortie avec ${proposal.proposeWith}`;
    const [first] = proposal.proposeSlots;
    if (!first) {
      this.openNewEvent();
      this.popoverData.update(data => ({ ...data, title }));
      return;
    }
    this.startCreatingEvent(undefined, first.start, first.end);
    this.popoverData.update(data => ({ ...data, title, candidateSlots: proposal.proposeSlots }));
  }

  ngOnDestroy(): void {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
    }
  }

  // Touch event handlers for swipe-to-dismiss on mobile
  /** Whether the current touch may drag the panel down: off when it started in a scrolled list. */
  private canDragDetails = false;

  onDetailsTouchStart(event: TouchEvent) {
    this.touchStartY = event.touches[0].clientY;
    this.touchCurrentY = this.touchStartY;
    this.isDragging = false;
    // A downward move in a list scrolled down is the user scrolling back up, not a dismissal:
    // only a list at its top (or the header) lets the panel be dragged away.
    const list = (event.currentTarget as HTMLElement | null)?.querySelector('.events-list');
    const inList = !!list && list.contains(event.target as Node);
    this.canDragDetails = !inList || list.scrollTop <= 0;
  }

  onDetailsTouchMove(event: TouchEvent) {
    if (!this.canDragDetails) return;

    const currentY = event.touches[0].clientY;
    const deltaY = currentY - this.touchStartY;

    // Only start dragging if we've moved significantly (threshold of 10px)
    if (!this.isDragging && Math.abs(deltaY) > 10) {
      // Only allow downward swipe to start a drag for dismissal
      if (deltaY > 0) {
        this.isDragging = true;
      }
    }

    if (!this.isDragging) return;

    this.touchCurrentY = currentY;

    // Prevent Safari's pull-to-refresh and other default behaviors only when dragging
    event.preventDefault();

    const detailsSection = event.currentTarget as HTMLElement;
    detailsSection.style.transform = `translateY(${deltaY}px)`;
    detailsSection.style.transition = 'none';
  }

  onDetailsTouchEnd(event: TouchEvent) {
    if (!this.isDragging) return;

    const deltaY = this.touchCurrentY - this.touchStartY;

    // Swiped down more than 100px: close it. It used to clear the date and events only, so the
    // panel snapped back open, empty.
    if (deltaY > 100) {
      this.closeDetails();
    }
    this.resetDetailsDrag(event);
  }

  /** An interrupted touch (a call, a system gesture) puts the panel back where it was. */
  onDetailsTouchCancel(event: TouchEvent) {
    this.resetDetailsDrag(event);
  }

  private resetDetailsDrag(event: TouchEvent) {
    const detailsSection = event.currentTarget as HTMLElement | null;
    detailsSection?.style.setProperty('transform', '');
    detailsSection?.style.setProperty('transition', '');
    this.isDragging = false;
    this.canDragDetails = false;
  }

  private updateTimePosition(): void {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const totalMinutes = 24 * 60;
    this.currentTimePosition.set((minutes / totalMinutes) * 100);
  }

  getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return this.isSameDate(date, today);
  }

  private scrollToCurrentTime() {
    const container = document.querySelector('.week-schedule-container');
    if (!container?.scrollTo) return;

    const now = new Date();
    const currentHour = now.getHours();

    // Vertical Scroll
    // Each hour slot is 80px tall (desktop) or 60px (mobile)
    const isMobile = window.innerWidth <= 768;
    const hourHeight = isMobile ? 60 : 80;
    const headerHeight = isMobile ? 80 : 100;

    const verticalScroll = (currentHour * hourHeight) + headerHeight - (container.clientHeight / 2);

    // Horizontal Scroll to today
    const todayColumn = container.querySelector('.day-column.today') as HTMLElement;
    let horizontalScroll = 0;
    if (todayColumn) {
      // Find position relative to the container
      const containerRect = container.getBoundingClientRect();
      const columnRect = todayColumn.getBoundingClientRect();

      // Calculate scroll to center the column
      horizontalScroll = container.scrollLeft + (columnRect.left - containerRect.left) - (container.clientWidth / 2) + (todayColumn.clientWidth / 2);
    }

    container.scrollTo({
      top: Math.max(0, verticalScroll),
      left: Math.max(0, horizontalScroll),
      behavior: 'smooth'
    });
  }

  toggleView(mode: 'month' | 'week' | 'day') {
    this.cancelCreatingEvent();
    this.viewMode.set(mode);

    // A phone's three days start where the month left off: today, when it is in that month.
    const today = new Date();
    const current = this.currentDate();
    if (mode === 'week' && this.onPhone() && today.getFullYear() === current.getFullYear() && today.getMonth() === current.getMonth()) {
      this.currentDate.set(startOfDay(today));
    }

    // Clear selection when switching to Month view
    if (mode === 'month') {
      this.selectedDate.set(null);
      this.isDetailsOpen.set(false);
    }

    // Set selectedDate for Day view if not already set
    if (mode === 'day' && !this.selectedDate()) {
      this.selectedDate.set(new Date(this.currentDate()));
    }

    this.generateCalendar();

    // Auto-scroll to current time in Week/Day views
    if (mode === 'week' || mode === 'day') {
      setTimeout(() => this.scrollToCurrentTime(), 100);
    }
  }

  private subscribedFeed: FeedEvent[] = [];
  private pollFeed: FeedEvent[] = [];

  private showEvents(): void {
    this.events.set(toCalendarEvents(this.subscribedFeed, this.pollFeed));
    this.generateCalendar();
  }

  generateCalendar(): void {
    const mode = this.viewMode();
    if (mode === 'month') {
      this.generateMonthView();
    } else if (mode === 'week') {
      this.generateWeekView();
    } else {
      this.generateDayView();
    }
  }

  private generateMonthView(): void {
    const year = this.currentDate().getFullYear();
    const month = this.currentDate().getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startingDayOfWeek = (firstDay.getDay() + 6) % 7; // Convert 0=Sun to 6, 1=Mon to 0
    const totalDays = lastDay.getDate();

    // Built locally and published once, rather than pushed into the rendered array: each write
    // to a signal is a change notification, and 42 of them per redraw is 41 too many.
    const days: CalendarDay[] = [];

    // Trailing days of the previous month, filling the row before the 1st.
    for (let i = 0; i < startingDayOfWeek; i++) {
      const date = new Date(year, month, -i);
      days.unshift({
        date: date,
        isCurrentMonth: false,
        isToday: false,
        hasEvents: false
      });
    }

    for (let i = 1; i <= totalDays; i++) {
      const date = new Date(year, month, i);
      days.push({
        date: date,
        isCurrentMonth: true,
        isToday: this.isSameDate(date, new Date()),
        hasEvents: this.events().some(event => this.isSameDate(event.startDate, date))
      });
    }

    // Leading days of the next month, so the grid is always six full rows.
    const remainingDays = MONTH_GRID_CELLS - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(year, month + 1, i);
      days.push({
        date: date,
        isCurrentMonth: false,
        isToday: false,
        hasEvents: false
      });
    }

    this.days.set(days);
  }

  private generateWeekView(): void {
    const current = new Date(this.currentDate());
    // A phone's three days start on the current date; a week starts on its Monday.
    const dayOfWeek = this.onPhone() ? 0 : (current.getDay() + 6) % 7;
    const firstDayOfWeek = new Date(current.setDate(current.getDate() - dayOfWeek));
    const days: CalendarDay[] = [];

    for (let i = 0; i < (this.onPhone() ? DAYS_ON_PHONE : DAYS_IN_WEEK); i++) {
      const date = new Date(firstDayOfWeek);
      date.setDate(firstDayOfWeek.getDate() + i);
      days.push({
        date: date,
        isCurrentMonth: date.getMonth() === this.currentDate().getMonth(),
        isToday: this.isSameDate(date, new Date()),
        hasEvents: this.events().some(event => this.isSameDate(event.startDate, date))
      });
    }

    this.days.set(days);
  }

  private generateDayView(): void {
    const selected = this.selectedDate();
    const date = selected ? new Date(selected) : new Date(this.currentDate());

    this.days.set([{
      date: date,
      isCurrentMonth: true,
      isToday: this.isSameDate(date, new Date()),
      hasEvents: this.events().some(event => this.isSameDate(event.startDate, date))
    }]);
  }

  isSameDate(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate();
  }

  /**
   * The events grouped by day, earliest first, rebuilt only when the events change.
   *
   * <p>The templates used to filter the whole list per cell: the week view called
   * `getEventsForHour` for each of its 168 hour cells on every change detection — and every
   * pointer move over the grid, or touch move while dragging, runs one. Lookups are now O(1)
   * and return the same array each time, so `@for` has nothing to diff either.
   */
  private readonly eventsByDay = computed(() => {
    const byDay = new Map<string, CalendarEvent[]>();
    const sorted = [...this.events()].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    for (const event of sorted) {
      const key = event.startDate.toDateString();
      byDay.set(key, [...(byDay.get(key) ?? []), event]);
    }
    return byDay;
  });

  /** The same events, by day and starting hour, for the week and day grids. */
  private readonly eventsByHour = computed(() => {
    const byHour = new Map<string, CalendarEvent[]>();
    for (const [day, events] of this.eventsByDay()) {
      for (const event of events) {
        const key = `${day}|${event.startDate.getHours()}`;
        byHour.set(key, [...(byHour.get(key) ?? []), event]);
      }
    }
    return byHour;
  });

  getEventsForDay(date: Date): CalendarEvent[] {
    return this.eventsByDay().get(date.toDateString()) ?? NO_EVENTS;
  }

  /** The events a month cell has room to name, earliest first. */
  monthCellEvents(date: Date): CalendarEvent[] {
    const events = this.getEventsForDay(date);
    return events.length <= MONTH_CELL_EVENTS ? events : events.slice(0, MONTH_CELL_EVENTS);
  }

  /** How many events the cell could not name, or 0 when they all fit. */
  hiddenEventCount(date: Date): number {
    return Math.max(0, this.getEventsForDay(date).length - MONTH_CELL_EVENTS);
  }

  getAllDayEvents(date: Date): CalendarEvent[] {
    const events = this.getEventsForDay(date).filter(event => event.time.toLowerCase() === 'all day');
    return events.length > 0 ? events : NO_EVENTS;
  }

  getEventsForHour(date: Date, hour: number): CalendarEvent[] {
    return this.eventsByHour().get(`${date.toDateString()}|${hour}`) ?? NO_EVENTS;
  }

  getEventHeight(event: CalendarEvent): number {
    const durationMs = event.endDate.getTime() - event.startDate.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);
    return durationHours * 100; // 1h = 100% of the cell
  }

  getEventMinuteOffset(event: CalendarEvent): number {
    return (event.startDate.getMinutes() / 60) * 100;
  }

  navigate(delta: number) {
    if (this.viewMode() === 'month') {
      this.currentDate.set(new Date(this.currentDate().getFullYear(), this.currentDate().getMonth() + delta, 1));
    } else if (this.viewMode() === 'week') {
      const step = this.onPhone() ? DAYS_ON_PHONE : DAYS_IN_WEEK;
      this.currentDate.set(new Date(this.currentDate().getFullYear(), this.currentDate().getMonth(), this.currentDate().getDate() + (delta * step)));
    } else {
      // Day view navigation: move by 1 day and sync selectedDate
      const selected = this.selectedDate();
      const nextDate = selected ? new Date(selected) : new Date(this.currentDate());
      nextDate.setDate(nextDate.getDate() + delta);
      this.selectedDate.set(nextDate);
      this.currentDate.set(new Date(nextDate));
    }
    this.generateCalendar();
    if (this.viewMode() !== 'day') this.selectedDate.set(null);
  }

  selectDate(day: CalendarDay) {
    this.selectedDate.set(day.date);
    this.selectedEvents.set(this.events().filter(e => this.isSameDate(e.startDate, day.date)));
    this.isDetailsOpen.set(true);
  }

  // Week/Day View: click or drag to create
  /**
   * A mouse press starts the selection at once: a click makes a one-hour event there, a drag
   * a range. A finger cannot drag without scrolling, so on touch a tap makes the one-hour event
   * and a hold of {@link SELECTION_DELAY} starts the drag.
   */
  onTimeMouseDown(event: MouseEvent | TouchEvent, date: Date, hour: number) {
    if (this.isPopoverVisible()) return;
    const isMouse = event instanceof MouseEvent;
    if (isMouse && (event.button !== 0 || Date.now() - this.lastTouchAt < COMPAT_MOUSE_GUARD_MS)) return;
    // A press on an event opens that event, never a new one.
    if (event.target instanceof Element && event.target.closest('.inline-event-card')) return;

    const clientX = isMouse ? event.clientX : (event as TouchEvent).touches[0].clientX;
    const clientY = isMouse ? event.clientY : (event as TouchEvent).touches[0].clientY;
    this.touchStartPos = { x: clientX, y: clientY };

    // Clear any previous selection state
    this.cancelCreatingEvent();

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const fractionalHour = Math.min(Math.floor((relativeY / rect.height) * 4) / 4, 0.75);
    const startHour = hour + fractionalHour;

    if (isMouse) {
      // No text selection while dragging across the grid.
      event.preventDefault();
      this.beginSelection(date, startHour);
      return;
    }

    this.lastTouchAt = Date.now();
    this.pendingTap = { date, startHour };
    // Scrolling is locked afterwards, in onTouchMove, once the hold has turned into a selection:
    // a preventDefault here would act on an event long finished.
    this.selectionTimeout = setTimeout(() => {
      this.pendingTap = null;
      this.beginSelection(date, startHour);
    }, this.SELECTION_DELAY);
  }

  private beginSelection(date: Date, startHour: number): void {
    this.isSelectingRange.set(true);
    this.selectionDate.set(date);
    this.selectionEndDate.set(date);
    this.selectionStartHour.set(startHour);
    this.selectionEndHour.set(startHour + DEFAULT_EVENT_MINUTES / 60);
  }

  /**
   * The pointer entered another hour cell: the range now covers that whole hour when it is after
   * the start, and runs from its top when it is before.
   */
  onTimeMouseEnter(hour: number, date?: Date) {
    const anchorDay = this.selectionDate();
    const startHour = this.selectionStartHour();
    if (!this.isSelectingRange() || !anchorDay || startHour === null) return;
    const day = date ?? this.selectionEndDate() ?? anchorDay;
    const afterStart = atHour(day, hour + 1) > atHour(anchorDay, startHour);
    this.selectionEndHour.set(afterStart ? hour + 1 : hour);
    this.selectionEndDate.set(day);
  }

  /**
   * The dragged range, earliest end first. It runs continuously from the day the drag started
   * to the day under the pointer, nights included.
   */
  selectionRange(): { start: Date; end: Date } | null {
    const day = this.selectionDate();
    const startHour = this.selectionStartHour();
    const endHour = this.selectionEndHour();
    if (!day || startHour === null || endHour === null) {
      return null;
    }
    const anchor = atHour(day, startHour);
    const current = atHour(this.selectionEndDate() ?? day, endHour);
    return anchor <= current ? { start: anchor, end: current } : { start: current, end: anchor };
  }

  onTouchMove(event: TouchEvent) {
    const touch = event.touches[0];

    // Case 1: Not selected yet, checking for scroll intent
    if (this.selectionTimeout && !this.isSelectingRange()) {
      const moveDistance = Math.sqrt(
        Math.pow(touch.clientX - this.touchStartPos.x, 2) +
        Math.pow(touch.clientY - this.touchStartPos.y, 2)
      );

      if (moveDistance > TOUCH_SLOP_PX) {
        // User moved too much, they likely want to scroll, cancel the hold
        clearTimeout(this.selectionTimeout);
        this.selectionTimeout = undefined;
        this.pendingTap = null;
      }
      return;
    }

    if (!this.isSelectingRange()) return;

    // Case 2: Already selecting (drag mode), lock scroll and expand selection
    if (event.cancelable) event.preventDefault();

    const element = document.elementFromPoint(touch.clientX, touch.clientY);

    let target = element as HTMLElement;
    while (target && !target.classList.contains('hour-cell')) {
      target = target.parentElement as HTMLElement;
    }

    if (target) {
      const hourAttr = target.getAttribute('data-hour');
      const dayAttr = target.getAttribute('data-day');
      if (hourAttr !== null) {
        const hour = parseFloat(hourAttr);
        const day = dayAttr ? new Date(dayAttr) : undefined;
        this.onTimeMouseEnter(hour, day);
      }
    }
  }

  onTimeMouseUp(event: MouseEvent | TouchEvent) {
    if (this.selectionTimeout) {
      clearTimeout(this.selectionTimeout);
      this.selectionTimeout = undefined;
    }
    const isMouse = event instanceof MouseEvent;
    if (!isMouse) {
      this.lastTouchAt = Date.now();
    }

    const tap = this.pendingTap;
    this.pendingTap = null;
    if (tap && !this.isSelectingRange()) {
      const start = atHour(tap.date, tap.startHour);
      this.selectionDate.set(tap.date);
      this.startCreatingEvent(undefined, start, new Date(start.getTime() + DEFAULT_EVENT_MINUTES * 60000));
      return;
    }

    if (!this.isSelectingRange()) return;

    this.isSelectingRange.set(false);

    // Drag detection: only open if the range has a length.
    const range = this.selectionRange();

    if (range && range.end > range.start) {
      this.selectedDate.set(range.start);

      this.startCreatingEvent(undefined, range.start, range.end);
    } else {
      // Clear if it was just a click
      this.cancelCreatingEvent();
    }
  }

  /** The part of the dragged range that falls on this day, as a box in its column. */
  getSelectionStyle(date: Date) {
    const range = this.selectionRange();
    if (!range || (!this.isSelectingRange() && !this.isPopoverVisible())) {
      return { display: 'none' };
    }

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    if (range.end <= dayStart || range.start >= dayEnd) {
      return { display: 'none' };
    }

    const from = Math.max(range.start.getTime(), dayStart.getTime());
    const to = Math.min(range.end.getTime(), dayEnd.getTime());
    const start = (from - dayStart.getTime()) / HOUR_MS;
    const duration = (to - from) / HOUR_MS;

    const hourHeight = this.hourHeight();

    // Ensure at least a small line (4px) is visible
    const height = Math.max(duration * hourHeight, 4);

    return {
      display: 'block',
      top: `${start * hourHeight}px`,
      height: `${height}px`
    };
  }
  /**
   * Escape closes the new-event form, or else the panel.
   *
   * <p>The backdrops are click-to-dismiss, but a div cannot take focus, so it can never
   * receive a key event: keyboard dismissal has to live on the component.
   */
  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.isPopoverVisible()) {
      this.cancelCreatingEvent();
    } else if (this.isDetailsOpen()) {
      this.closeDetails();
    }
  }


  closeDetails() {
    this.selectedDate.set(null);
    this.isDetailsOpen.set(false);
    this.isPopoverVisible.set(false);
  }

  /** The "Nouvel événement" button, and the day panel's: the form opens on that day at a sensible hour. */
  openNewEvent(day?: Date): void {
    this.cancelCreatingEvent();
    const start = defaultStart(day ?? this.defaultDay());
    const end = new Date(start.getTime() + DEFAULT_EVENT_MINUTES * 60000);
    this.startCreatingEvent(day, start, end);
  }

  /** The day the button creates on: the day shown, or today when it is on screen. */
  private defaultDay(): Date {
    const days = this.days();
    if (this.viewMode() === 'day' && days.length > 0) {
      return days[0].date;
    }
    const today = days.find(day => day.isToday);
    if (today) {
      return today.date;
    }
    const first = this.viewMode() === 'month' ? days.find(day => day.isCurrentMonth) : days[0];
    return first?.date ?? new Date(this.currentDate());
  }

  dismissCreateHint(): void {
    this.showCreateHint.set(false);
    writeHintDone();
  }

  /** Opens the form, centred on screen, on the given range or day. */
  startCreatingEvent(targetDate?: Date, startDate?: Date, endDate?: Date) {
    if (!this.selectedDate() && !targetDate && !startDate) return;

    const baseDate = startDate || targetDate || this.selectedDate() || new Date();
    const finalEndDate = endDate || new Date(baseDate.getTime() + DEFAULT_EVENT_MINUTES * 60000);
    this.createError.set(null);

    this.popoverData.set({
      title: '',
      description: '',
      location: '',
      startDate: baseDate,
      endDate: finalEndDate,
    });

    this.isPopoverVisible.set(true);
    this.popoverOpenedAt = Date.now();
    // Closed, but selectedDate is kept: it is the date the new event belongs to.
    this.isDetailsOpen.set(false);
  }

  /**
   * The backdrop under a freshly opened popover. After a hold, the finger lifting off sends a
   * click that lands on this backdrop, which closed the popover the moment it appeared.
   */
  onPopoverBackdropClick() {
    if (Date.now() - this.popoverOpenedAt < POPOVER_CLICK_GUARD_MS) return;
    this.cancelCreatingEvent();
  }

  /** A touch the system interrupted (a call, a gesture) must not leave a selection half-made. */
  onTimeTouchCancel() {
    if (this.selectionTimeout) {
      clearTimeout(this.selectionTimeout);
      this.selectionTimeout = undefined;
    }
    if (this.isSelectingRange()) {
      this.cancelCreatingEvent();
    }
  }

  cancelCreatingEvent() {
    this.pendingTap = null;
    this.isPopoverVisible.set(false);
    this.isSelectingRange.set(false);
    this.selectionDate.set(null);
    this.selectionEndDate.set(null);
    this.selectionStartHour.set(null);
    this.selectionEndHour.set(null);
    this.selectedDate.set(null);
  }

  submitEvent(data: EventCreateRequest) {
    if (!data.title || !data.startDate || this.savingEvent()) return;

    this.savingEvent.set(true);
    this.createError.set(null);
    this.eventService.createEvent(data).subscribe({
      next: created => {
        this.savingEvent.set(false);
        this.isPopoverVisible.set(false);
        this.isDetailsOpen.set(false);
        this.selectedDate.set(null);
        this.selectionDate.set(null);
        this.selectionStartHour.set(null);
        this.selectionEndHour.set(null);
        this.generateCalendar();
        this.dismissCreateHint();
        this.announceCreated(created);
      },
      error: (err: unknown) => {
        this.savingEvent.set(false);
        const invalidPoll = err instanceof HttpErrorResponse && err.error?.code === POLL_INVALID_CODE;
        this.createError.set(invalidPoll
          ? 'Les créneaux proposés ne sont pas valides : chacun doit être à venir et différent des autres.'
          : 'L\'événement n\'a pas pu être créé. Réessayez dans un instant.');
        this.logger.error('CalendarComponent', 'Error creating event:', err);
      }
    });
  }

  /**
   * « Événement créé », naming what it overlaps if anything: the event's page is where the
   * conflict can be resolved. Without an answer on conflicts, it is announced as created.
   */
  private announceCreated(created: FeedEvent): void {
    const open = () => this.router.navigate(['/event', created.id]);
    const conflicts$ = created.poll?.status === 'OPEN' ? of<FeedEvent[]>([]) : this.schedule.getConflicts(created.id);
    conflicts$.pipe(catchError(() => of<FeedEvent[]>([]))).subscribe(conflicts => {
      const message = conflicts.length === 0 ? 'Événement créé'
        : conflicts.length === 1 ? `Événement créé · il chevauche « ${conflicts[0].title} »`
        : `Événement créé · il chevauche ${conflicts.length} événements`;
      this.notifications.showAction(message, conflicts.length === 0 ? 'Voir' : 'Replanifier', open);
    });
  }

  viewEventDetails(event: CalendarEvent) {
    this.router.navigate(['/event', event.id], {
      state: { event }
    });
  }
}
