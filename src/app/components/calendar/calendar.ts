import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoggerService } from '../../core/logging/logger.service';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EventService, FeedEvent, EventCreateRequest } from '../../services/event.service';

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

/** Six rows of seven, so the month grid never changes height between months. */
const MONTH_GRID_CELLS = 42;
const DAYS_IN_WEEK = 7;

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
}

import { QuickEventPopoverComponent, PopoverPosition } from '../quick-event-popover/quick-event-popover';

/** How many event titles a month cell names before it starts counting the rest. */
const MONTH_CELL_EVENTS = 3;

/** Popover geometry, in CSS pixels. */
const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 400;
const POPOVER_PADDING = 20;
const POPOVER_GAP = 5;
/** Below this width the popover is pinned to the corner rather than anchored. */
const POPOVER_MOBILE_BREAKPOINT = 768;
/** Columns up to this index open to the right of their cell; later ones flip. */
const POPOVER_FLIP_COLUMN = 3;
/** The arrow stays within the popover's own height, as a percentage. */
const POPOVER_ARROW_MIN = 10;
const POPOVER_ARROW_MAX = 90;

/** Keeps a value inside a range. */
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, FormsModule, QuickEventPopoverComponent],
  templateUrl: './calendar.html',
  styleUrl: './calendar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalendarComponent implements OnInit, OnDestroy {
  private readonly logger = inject(LoggerService);
  private readonly eventService = inject(EventService);
  private readonly router = inject(Router);
  private readonly el = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentDate = signal(new Date());
  readonly days = signal<CalendarDay[]>([]);
  readonly weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly hours = Array.from({ length: 24 }, (_, i) => i);
  readonly currentTimePosition = signal(0);
  readonly viewMode = signal<'month' | 'week' | 'day'>('month');

  readonly selectedDate = signal<Date | null>(null);
  readonly selectedEvents = signal<CalendarEvent[]>([]);

  private timeUpdateInterval?: ReturnType<typeof setInterval>;

  // Popover state
  readonly isPopoverVisible = signal(false);
  readonly popoverPosition = signal<PopoverPosition>({ x: 0, y: 0, arrowSide: 'top' });
  readonly arrowOffset = signal(50);
  readonly isMobilePopover = signal(false);
  readonly popoverData = signal<EventCreateRequest>({
    title: 'New Event',
    description: '',
    location: '',
    startDate: new Date(),
    endDate: new Date(),
    subscribeByDefault: false,
  });

  /**
   * Whether the day panel is showing.
   *
   * <p>Not derived from {@link selectedDate}, tempting as that is: `startCreatingEvent` closes
   * the panel while keeping the selected date, because that date is what the new event is
   * anchored to.
   */
  readonly isDetailsOpen = signal(false);

  private isHoldActive = false;

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

  // Range selection, drag to create
  isSelectingRange = false;
  selectionStartHour: number | null = null;
  selectionEndHour: number | null = null;
  selectionDate: Date | null = null;
  private selectionTimeout?: ReturnType<typeof setTimeout>;
  private readonly SELECTION_DELAY = 400; // ms

  // Touch event tracking for swipe-to-dismiss
  private touchStartY = 0;
  private touchCurrentY = 0;
  private isDragging = false;

  ngOnInit(): void {
    // The load used to be triggered by the root-provided service's constructor: both requests
    // went out at bootstrap, including for a signed-out visitor on the landing page, where they
    // could only come back 401.
    this.eventService.refreshEvents();

    this.eventService.subscribedEvents$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((feedEvents: FeedEvent[]) => {
        const subscribedEvents = feedEvents.map(event => this.convertFeedEventToCalendarEvent(event));

        this.events.set(subscribedEvents);
        this.generateCalendar();
      });

    // Started once, outside the subscription. It used to be created inside it, so every emission
    // of subscribedEvents$ started another interval and only the last handle was kept — the rest
    // ran until the tab closed, each one repainting the now-line every minute.
    this.updateTimePosition();
    this.timeUpdateInterval = setInterval(() => this.updateTimePosition(), TIME_MARKER_REFRESH_MS);
  }

  ngOnDestroy(): void {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
    }
  }

  // Touch event handlers for swipe-to-dismiss on mobile
  onDetailsTouchStart(event: TouchEvent) {
    this.touchStartY = event.touches[0].clientY;
    this.touchCurrentY = this.touchStartY;
    this.isDragging = false;
  }

  onDetailsTouchMove(event: TouchEvent) {
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
    const detailsSection = event.currentTarget as HTMLElement;

    // If swiped down more than 100px, close the panel
    if (deltaY > 100) {
      this.selectedDate.set(null);
      this.selectedEvents.set([]);
    }

    // Reset transform
    detailsSection.style.transform = '';
    detailsSection.style.transition = '';
    this.isDragging = false;
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
    if (!container) return;

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

  private convertFeedEventToCalendarEvent(feedEvent: FeedEvent): CalendarEvent {
    const start = new Date(feedEvent.startDate);
    const end = feedEvent.endDate ? new Date(feedEvent.endDate) : new Date(start.getTime() + 3600000);

    return {
      id: feedEvent.id,
      title: feedEvent.title,
      time: this.formatTimeRange(start, end),
      description: feedEvent.description,
      startDate: start,
      endDate: end
    };
  }

  private formatTimeRange(start: Date, end: Date): string {
    const format = (d: Date) => {
      let hours = d.getHours();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const minutes = d.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes} ${ampm}`;
    };
    return `${format(start)} - ${format(end)}`;
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
    const dayOfWeek = (current.getDay() + 6) % 7;
    const firstDayOfWeek = new Date(current.setDate(current.getDate() - dayOfWeek));
    const days: CalendarDay[] = [];

    for (let i = 0; i < DAYS_IN_WEEK; i++) {
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

  getEventsForDay(date: Date): CalendarEvent[] {
    return this.events().filter(event => this.isSameDate(event.startDate, date));
  }

  /** The events a month cell has room to name, earliest first. */
  monthCellEvents(date: Date): CalendarEvent[] {
    return this.getEventsForDay(date)
      .slice()
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .slice(0, MONTH_CELL_EVENTS);
  }

  /** How many events the cell could not name, or 0 when they all fit. */
  hiddenEventCount(date: Date): number {
    return Math.max(0, this.getEventsForDay(date).length - MONTH_CELL_EVENTS);
  }

  getAllDayEvents(date: Date): CalendarEvent[] {
    return this.events().filter(event =>
      this.isSameDate(event.startDate, date) && event.time.toLowerCase() === 'all day'
    );
  }

  getEventsForHour(date: Date, hour: number): CalendarEvent[] {
    return this.events().filter(event => {
      if (!this.isSameDate(event.startDate, date)) return false;
      return event.startDate.getHours() === hour;
    });
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
      this.currentDate.set(new Date(this.currentDate().getFullYear(), this.currentDate().getMonth(), this.currentDate().getDate() + (delta * 7)));
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

  onMonthDayMouseDown(event: MouseEvent | TouchEvent, day: CalendarDay) {
    if (this.isPopoverVisible()) return;

    // Save start position for scroll detection
    const clientX = (event instanceof MouseEvent) ? event.clientX : (event as TouchEvent).touches[0].clientX;
    const clientY = (event instanceof MouseEvent) ? event.clientY : (event as TouchEvent).touches[0].clientY;
    this.touchStartPos = { x: clientX, y: clientY };

    this.isHoldActive = false;

    // Clear any previous timer
    if (this.selectionTimeout) {
      clearTimeout(this.selectionTimeout);
    }

    this.selectionTimeout = setTimeout(() => {
      // Prevent default ONLY once hold is confirmed to avoid blocking scroll initially
      if (event.cancelable) event.preventDefault();

      this.selectedDate.set(day.date);
      this.selectedEvents.set(this.events().filter(e => this.isSameDate(e.startDate, day.date)));
      this.isHoldActive = true;
      this.isDetailsOpen.set(false);

      const uiEvent = (event instanceof MouseEvent) ? event : (event as TouchEvent).touches[0] as unknown as MouseEvent;
      this.startCreatingEvent(uiEvent, day.date);
    }, this.SELECTION_DELAY);
  }

  onMonthDayMouseUp() {
    if (this.selectionTimeout) {
      clearTimeout(this.selectionTimeout);
      this.selectionTimeout = undefined;
    }
  }

  selectDate(day: CalendarDay) {
    if (this.isHoldActive) {
      this.isHoldActive = false;
      return;
    }
    this.selectedDate.set(day.date);
    this.selectedEvents.set(this.events().filter(e => this.isSameDate(e.startDate, day.date)));
    this.isDetailsOpen.set(true);
  }

  // Week/Day View Drag-to-Select
  onTimeMouseDown(event: MouseEvent | TouchEvent, date: Date, hour: number) {
    if (this.isPopoverVisible()) return;

    // Save start position
    const clientX = (event instanceof MouseEvent) ? event.clientX : (event as TouchEvent).touches[0].clientX;
    const clientY = (event instanceof MouseEvent) ? event.clientY : (event as TouchEvent).touches[0].clientY;
    this.touchStartPos = { x: clientX, y: clientY };

    // Clear any previous selection state
    this.cancelCreatingEvent();

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const fractionalHour = Math.round((relativeY / rect.height) * 4) / 4;
    const startHour = hour + fractionalHour;

    this.selectionTimeout = setTimeout(() => {
      // Lock scroll only after hold is successful
      if (event.cancelable) event.preventDefault();

      this.isSelectingRange = true;
      this.selectionDate = date;
      this.selectionStartHour = startHour;
      this.selectionEndHour = startHour + 0.5;
    }, this.SELECTION_DELAY);
  }

  onTimeMouseEnter(hour: number) {
    if (!this.isSelectingRange) return;
    this.selectionEndHour = hour;
  }

  onTouchMove(event: TouchEvent) {
    const touch = event.touches[0];

    // Case 1: Not selected yet, checking for scroll intent
    if (this.selectionTimeout && !this.isSelectingRange) {
      const moveDistance = Math.sqrt(
        Math.pow(touch.clientX - this.touchStartPos.x, 2) +
        Math.pow(touch.clientY - this.touchStartPos.y, 2)
      );

      if (moveDistance > 10) {
        // User moved too much, they likely want to scroll, cancel the hold
        clearTimeout(this.selectionTimeout);
        this.selectionTimeout = undefined;
      }
      return;
    }

    if (!this.isSelectingRange) return;

    // Case 2: Already selecting (drag mode), lock scroll and expand selection
    if (event.cancelable) event.preventDefault();

    const element = document.elementFromPoint(touch.clientX, touch.clientY);

    let target = element as HTMLElement;
    while (target && !target.classList.contains('hour-cell')) {
      target = target.parentElement as HTMLElement;
    }

    if (target) {
      const hourAttr = target.getAttribute('data-hour');
      if (hourAttr !== null) {
        const hour = parseFloat(hourAttr);
        if (this.selectionEndHour !== hour) {
          this.onTimeMouseEnter(hour);
        }
      }
    }
  }

  onTimeMouseUp(event: MouseEvent | TouchEvent) {
    if (this.selectionTimeout) {
      clearTimeout(this.selectionTimeout);
      this.selectionTimeout = undefined;
    }

    if (!this.isSelectingRange) return;

    this.isSelectingRange = false;

    // Drag detection: only open if start and end are different (at least 30min or a clear drag)
    const startHour = this.selectionStartHour || 0;
    const endHour = this.selectionEndHour || 0;
    const hasDragged = Math.abs(endHour - startHour) > 0;

    if (this.selectionDate && hasDragged) {
      const minHour = Math.min(startHour, endHour);
      const maxHour = Math.max(startHour, endHour);

      // Set up before it is published: calling setHours on the value already inside the signal
      // would change it without notifying anything, since the reference never changes.
      const startDate = new Date(this.selectionDate);
      startDate.setHours(Math.floor(minHour), minuteOf(minHour), 0, 0);
      this.selectedDate.set(startDate);

      const endDate = new Date(this.selectionDate);
      endDate.setHours(Math.floor(maxHour), minuteOf(maxHour), 0, 0);

      const uiEvent = (event instanceof MouseEvent) ? event : (event as TouchEvent).changedTouches[0] as unknown as MouseEvent;
      this.startCreatingEvent(uiEvent, undefined, startDate, endDate);
    } else {
      // Clear if it was just a click
      this.cancelCreatingEvent();
    }
  }

  getSelectionStyle(date: Date) {
    if (!this.selectionDate || !this.isSameDate(date, this.selectionDate)) {
      return { display: 'none' };
    }

    if (!this.isSelectingRange && !this.isPopoverVisible()) {
      return { display: 'none' };
    }

    const start = Math.min(this.selectionStartHour || 0, this.selectionEndHour || 0);
    const end = Math.max(this.selectionStartHour || 0, this.selectionEndHour || 0);
    const duration = end - start;

    const isMobile = window.innerWidth <= 768;
    const hourHeight = isMobile ? 60 : 80;

    // Ensure at least a small line (4px) is visible
    const height = Math.max(duration * hourHeight, 4);

    return {
      display: 'block',
      top: `${start * hourHeight}px`,
      height: `${height}px`
    };
  }
  /**
   * Escape closes the panel.
   *
   * <p>The backdrop is click-to-dismiss, but a div cannot take focus, so it can never
   * receive a key event: keyboard dismissal has to live on the component.
   */
  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.isDetailsOpen()) {
      this.closeDetails();
    }
  }


  closeDetails() {
    this.selectedDate.set(null);
    this.isDetailsOpen.set(false);
    this.isPopoverVisible.set(false);
  }

  startCreatingEvent(event: MouseEvent, targetDate?: Date, startDate?: Date, endDate?: Date) {
    if (!this.selectedDate() && !targetDate) return;

    const baseDate = startDate || targetDate || this.selectedDate() || new Date();
    const finalEndDate = endDate || new Date(baseDate.getTime() + 30 * 60000);

    this.popoverData.set({
      title: 'New Event',
      description: '',
      location: '',
      startDate: baseDate,
      endDate: finalEndDate,
      subscribeByDefault: false,
    });

    // Use current selectedDate if not provided to ensure calculation matches
    const dateToAnchor = targetDate || this.selectedDate();

    // Calculate position based on the click/drag event
    this.calculatePopoverPosition(event, dateToAnchor);
    this.isPopoverVisible.set(true);
    // Closed, but selectedDate is kept: it is the date the new event belongs to.
    this.isDetailsOpen.set(false);
  }

  /**
   * Places the new-event popover next to the day the user clicked.
   *
   * <p>This used to be one 130-line function with a cognitive complexity of 50. It resolved
   * the anchor's geometry twice — once to position the popover, once to aim its arrow — in
   * two near-identical blocks that had already drifted apart. The geometry is resolved once
   * here, by {@link anchorGeometry}, and everything else reads from it.
   */
  private calculatePopoverPosition(event: MouseEvent, targetDate?: Date | null) {
    const container = this.el.nativeElement.querySelector('.calendar-container');
    const containerRect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
    const dateToAnchor = targetDate || this.selectedDate();

    this.isMobilePopover.set(window.innerWidth <= POPOVER_MOBILE_BREAKPOINT);
    if (this.isMobilePopover()) {
      this.popoverPosition.set({ x: 0, y: 0, arrowSide: 'top' });
      return;
    }

    const anchor = this.anchorGeometry(dateToAnchor, containerRect);

    // With no anchor on screen the popover simply opens where the pointer is.
    let x = event.clientX - containerRect.left;
    let y = event.clientY - containerRect.top;
    let arrowSide: 'top' | 'left' | 'right' = 'top';

    if (anchor) {
      // Columns in the left half open to the right of the cell, and the reverse, so the
      // popover never hangs off the side of the grid.
      const opensRight = anchor.columnIndex <= POPOVER_FLIP_COLUMN;
      arrowSide = opensRight ? 'left' : 'right';
      x = opensRight ? anchor.right + POPOVER_GAP : anchor.left - POPOVER_WIDTH - POPOVER_GAP;
      y = anchor.centerY - POPOVER_HEIGHT / 2;
    }

    const maxWidth = containerRect.width || window.innerWidth;
    const maxHeight = containerRect.height || window.innerHeight;
    x = clamp(x, POPOVER_PADDING, maxWidth - POPOVER_WIDTH - POPOVER_PADDING);
    y = clamp(y, POPOVER_PADDING, maxHeight - POPOVER_HEIGHT - POPOVER_PADDING);

    this.popoverPosition.set({ x, y, arrowSide });

    // The popover is clamped, the thing it points at is not, so the arrow is offset to span
    // the gap. A missing anchor leaves it centred.
    const pointsSideways = arrowSide === 'left' || arrowSide === 'right';
    const canAim = pointsSideways && dateToAnchor && anchor && anchor.centerY > 0;
    this.arrowOffset.set(
      canAim
        ? clamp(((anchor.centerY - y) / POPOVER_HEIGHT) * 100, POPOVER_ARROW_MIN, POPOVER_ARROW_MAX)
        : 50,
    );
  }

  /**
   * The on-screen box the popover should point at, in container coordinates.
   *
   * <p>In month view that is the day cell. In week and day view it is the selection overlay
   * when the user dragged a range, and the whole column otherwise — and the date comes from
   * {@link selectionDate} in preference to the clicked one, because a drag ends on a
   * different cell than it started.
   *
   * <p>Returns null when the date is not currently rendered, which is what tells the caller
   * to fall back to the pointer position.
   */
  private anchorGeometry(
    date: Date | null | undefined,
    containerRect: { left: number; top: number },
  ): { left: number; right: number; centerY: number; columnIndex: number } | null {
    const toContainer = (rect: DOMRect) => ({
      left: rect.left - containerRect.left,
      right: rect.right - containerRect.left,
      centerY: rect.top - containerRect.top + rect.height / 2,
    });

    if (this.viewMode() === 'month') {
      if (!date) {
        return null;
      }
      const index = this.days().findIndex((day) => this.isSameDate(day.date, date));
      if (index === -1) {
        return null;
      }
      const cell = this.el.nativeElement.querySelectorAll('.day-cell')[index] as HTMLElement;
      return { ...toContainer(cell.getBoundingClientRect()), columnIndex: index % 7 };
    }

    const activeDate = this.selectionDate || date;
    if (!activeDate) {
      return null;
    }
    const index = this.days().findIndex((day) => this.isSameDate(day.date, activeDate));
    if (index === -1) {
      return null;
    }
    const column = this.el.nativeElement.querySelectorAll('.day-column')[index] as HTMLElement;
    if (!column) {
      return null;
    }

    // Week view carries a leading hours gutter among its siblings; day view does not.
    const siblings = Array.from(column.parentElement?.children || []);
    const columnIndex = siblings.indexOf(column) - (this.viewMode() === 'week' ? 1 : 0);

    const overlay = column.querySelector('.selection-overlay');
    const box = toContainer(column.getBoundingClientRect());
    const centerY = overlay
      ? toContainer(overlay.getBoundingClientRect()).centerY
      : box.centerY;

    return { left: box.left, right: box.right, centerY, columnIndex };
  }

  cancelCreatingEvent() {
    this.isPopoverVisible.set(false);
    this.selectionDate = null;
    this.selectionStartHour = null;
    this.selectionEndHour = null;
    this.selectedDate.set(null);
  }

  submitEvent(data: EventCreateRequest) {
    if (!data.title || !data.startDate) return;

    this.eventService.createEvent(data).subscribe({
      next: () => {
        this.isPopoverVisible.set(false);
        this.isDetailsOpen.set(false);
        this.selectedDate.set(null);
        this.selectionDate = null;
        this.selectionStartHour = null;
        this.selectionEndHour = null;
        this.generateCalendar();
      },
      error: (err) => this.logger.error('CalendarComponent', 'Error creating event:', err)
    });
  }

  viewEventDetails(event: CalendarEvent) {
    this.router.navigate(['/event', 'calendar', event.id], {
      state: { event }
    });
  }
}
