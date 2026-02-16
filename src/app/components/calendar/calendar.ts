import { Component, OnInit, OnDestroy, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EventService, FeedEvent, EventCreateRequest } from '../../services/event.service';
import { Subscription } from 'rxjs';

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  hasEvents: boolean;
}

interface CalendarEvent {
  id: string | number;
  title: string;
  time: string;
  description: string;
  startDate: Date;
  endDate: Date;
}

import { SharedChatComponent, ChatMessage } from '../shared/chat/shared-chat';
import { QuickEventPopoverComponent } from '../quick-event-popover/quick-event-popover';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, FormsModule, QuickEventPopoverComponent],
  templateUrl: './calendar.html',
  styleUrl: './calendar.scss',
})
export class CalendarComponent implements OnInit, OnDestroy {
  currentDate = new Date();
  days: CalendarDay[] = [];
  weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  hours = Array.from({ length: 24 }, (_, i) => i);
  currentTimePosition = 0;
  private timeUpdateInterval?: any;
  viewMode: 'month' | 'week' | 'day' = 'month';

  selectedDate: Date | null = null;
  selectedEvents: CalendarEvent[] = [];

  // Popover state
  isPopoverVisible = false;
  popoverPosition = { x: 0, y: 0, arrowSide: 'top' as 'top' | 'left' | 'right' };
  isMobilePopover = false;
  popoverData: EventCreateRequest = {
    title: 'New Event',
    description: '',
    location: '',
    startDate: new Date(),
    endDate: new Date(),
    subscribeByDefault: false,
  };

  // Touch event tracking
  private touchStartPos = { x: 0, y: 0 };
  personalEvents: CalendarEvent[] = [
    {
      id: 1,
      title: 'Team Meeting',
      time: '10:00 AM - 11:30 AM',
      description: 'Weekly sync with the team.',
      startDate: new Date(new Date().setHours(10, 0, 0, 0)),
      endDate: new Date(new Date().setHours(11, 30, 0, 0))
    },
    {
      id: 2,
      title: 'Lunch with Client',
      time: '12:30 PM - 1:30 PM',
      description: 'Discuss project roadmap.',
      startDate: new Date(new Date().setHours(12, 30, 0, 0)),
      endDate: new Date(new Date().setHours(13, 30, 0, 0))
    },
    {
      id: 3,
      title: 'Code Review',
      time: '03:00 PM - 4:00 PM',
      description: 'Review PR #123.',
      startDate: new Date(new Date().setHours(15, 0, 0, 0)),
      endDate: new Date(new Date().setHours(16, 0, 0, 0))
    }
  ];

  // All events (personal + subscribed)
  events: CalendarEvent[] = [];
  private subscription?: Subscription;

  // New Selection State (Apple Style)
  isSelectingRange = false;
  selectionStartHour: number | null = null;
  selectionEndHour: number | null = null;
  selectionDate: Date | null = null;
  private selectionTimeout?: any;
  private readonly SELECTION_DELAY = 250; // ms

  // Touch event tracking for swipe-to-dismiss
  private touchStartY = 0;
  private touchCurrentY = 0;
  private isDragging = false;

  constructor(
    private eventService: EventService,
    private router: Router,
    private el: ElementRef
  ) { }

  ngOnInit() {
    this.subscription = this.eventService.subscribedEvents$.subscribe((feedEvents: FeedEvent[]) => {
      // Merge personal events with subscribed feed events
      const subscribedEvents = feedEvents.map((e: FeedEvent) => this.convertFeedEventToCalendarEvent(e));

      this.events = [...this.personalEvents, ...subscribedEvents];
      this.generateCalendar();
      this.updateTimePosition();

      // Update time position every minute
      this.timeUpdateInterval = setInterval(() => this.updateTimePosition(), 60000);
    });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
    if (this.timeUpdateInterval) clearInterval(this.timeUpdateInterval);
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
      this.selectedDate = null;
      this.selectedEvents = [];
    }

    // Reset transform
    detailsSection.style.transform = '';
    detailsSection.style.transition = '';
    this.isDragging = false;
  }

  private updateTimePosition() {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const totalMinutes = 24 * 60;
    this.currentTimePosition = (minutes / totalMinutes) * 100;
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
    this.viewMode = mode;

    // Clear selection when switching to Month view
    if (mode === 'month') {
      this.selectedDate = null;
    }

    // Set selectedDate for Day view if not already set
    if (mode === 'day' && !this.selectedDate) {
      this.selectedDate = new Date(this.currentDate);
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

  generateCalendar() {
    if (this.viewMode === 'month') {
      this.generateMonthView();
    } else if (this.viewMode === 'week') {
      this.generateWeekView();
    } else {
      this.generateDayView();
    }
  }

  private generateMonthView() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startingDayOfWeek = (firstDay.getDay() + 6) % 7; // Convert 0=Sun to 6, 1=Mon to 0
    const totalDays = lastDay.getDate();

    this.days = [];

    // Previous month days
    for (let i = 0; i < startingDayOfWeek; i++) {
      const date = new Date(year, month, -i);
      this.days.unshift({
        date: date,
        isCurrentMonth: false,
        isToday: false,
        hasEvents: false
      });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      const date = new Date(year, month, i);
      this.days.push({
        date: date,
        isCurrentMonth: true,
        isToday: this.isSameDate(date, new Date()),
        hasEvents: this.events.some(e => this.isSameDate(e.startDate, date))
      });
    }

    // Next month days to fill grid (6 rows * 7 days = 42)
    const remainingDays = 42 - this.days.length;
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(year, month + 1, i);
      this.days.push({
        date: date,
        isCurrentMonth: false,
        isToday: false,
        hasEvents: false
      });
    }
  }

  private generateWeekView() {
    this.days = [];
    const current = new Date(this.currentDate);
    const dayOfWeek = (current.getDay() + 6) % 7;
    const firstDayOfWeek = new Date(current.setDate(current.getDate() - dayOfWeek));

    for (let i = 0; i < 7; i++) {
      const date = new Date(firstDayOfWeek);
      date.setDate(firstDayOfWeek.getDate() + i);
      this.days.push({
        date: date,
        isCurrentMonth: date.getMonth() === this.currentDate.getMonth(),
        isToday: this.isSameDate(date, new Date()),
        hasEvents: this.events.some(e => this.isSameDate(e.startDate, date))
      });
    }
  }

  private generateDayView() {
    this.days = [];
    const date = this.selectedDate ? new Date(this.selectedDate) : new Date(this.currentDate);
    this.days.push({
      date: date,
      isCurrentMonth: true,
      isToday: this.isSameDate(date, new Date()),
      hasEvents: this.events.some(e => this.isSameDate(e.startDate, date))
    });
  }

  isSameDate(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate();
  }

  getEventsForDay(date: Date): CalendarEvent[] {
    return this.events.filter(event => this.isSameDate(event.startDate, date));
  }

  getAllDayEvents(date: Date): CalendarEvent[] {
    return this.events.filter(event =>
      this.isSameDate(event.startDate, date) && event.time.toLowerCase() === 'all day'
    );
  }

  getEventsForHour(date: Date, hour: number): CalendarEvent[] {
    return this.events.filter(event => {
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
    if (this.viewMode === 'month') {
      this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + delta, 1);
    } else if (this.viewMode === 'week') {
      this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), this.currentDate.getDate() + (delta * 7));
    } else {
      // Day view navigation: move by 1 day and sync selectedDate
      const nextDate = this.selectedDate ? new Date(this.selectedDate) : new Date(this.currentDate);
      nextDate.setDate(nextDate.getDate() + delta);
      this.selectedDate = nextDate;
      this.currentDate = new Date(nextDate);
    }
    this.generateCalendar();
    if (this.viewMode !== 'day') this.selectedDate = null;
  }

  onMonthDayMouseDown(event: MouseEvent | TouchEvent, day: CalendarDay) {
    if (this.isPopoverVisible) return;

    // Save start position for scroll detection
    const clientX = (event instanceof MouseEvent) ? event.clientX : (event as TouchEvent).touches[0].clientX;
    const clientY = (event instanceof MouseEvent) ? event.clientY : (event as TouchEvent).touches[0].clientY;
    this.touchStartPos = { x: clientX, y: clientY };

    // Clear any previous timer
    if (this.selectionTimeout) {
      clearTimeout(this.selectionTimeout);
    }

    this.selectionTimeout = setTimeout(() => {
      // Prevent default ONLY once hold is confirmed to avoid blocking scroll initially
      if (event.cancelable) event.preventDefault();

      this.selectedDate = day.date;
      this.selectedEvents = this.events.filter(e => this.isSameDate(e.startDate, day.date));

      const uiEvent = (event instanceof MouseEvent) ? event : (event as TouchEvent).touches[0] as unknown as MouseEvent;
      this.startCreatingEvent(uiEvent);
    }, this.SELECTION_DELAY);
  }

  onMonthDayMouseUp() {
    if (this.selectionTimeout) {
      clearTimeout(this.selectionTimeout);
      this.selectionTimeout = null;
    }
  }

  selectDate(day: CalendarDay) {
    this.selectedDate = day.date;
    this.selectedEvents = this.events.filter(e => this.isSameDate(e.startDate, day.date));
  }

  // Week/Day View Drag-to-Select
  onTimeMouseDown(event: MouseEvent | TouchEvent, date: Date, hour: number) {
    if (this.isPopoverVisible) return;

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
        this.selectionTimeout = null;
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
      this.selectionTimeout = null;
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

      this.selectedDate = new Date(this.selectionDate);
      this.selectedDate.setHours(Math.floor(minHour), (minHour % 1 === 0.25 ? 15 : minHour % 1 === 0.5 ? 30 : minHour % 1 === 0.75 ? 45 : 0), 0, 0);

      const endDate = new Date(this.selectionDate);
      endDate.setHours(Math.floor(maxHour), (maxHour % 1 === 0.25 ? 15 : maxHour % 1 === 0.5 ? 30 : maxHour % 1 === 0.75 ? 45 : 0), 0, 0);

      const uiEvent = (event instanceof MouseEvent) ? event : (event as TouchEvent).changedTouches[0] as unknown as MouseEvent;
      this.startCreatingEvent(uiEvent, endDate);
    } else {
      // Clear if it was just a click
      this.cancelCreatingEvent();
    }
  }

  getSelectionStyle(date: Date) {
    if (!this.selectionDate || !this.isSameDate(date, this.selectionDate)) {
      return { display: 'none' };
    }

    if (!this.isSelectingRange && !this.isPopoverVisible) {
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

  closeDetails() {
    this.selectedDate = null;
    this.isPopoverVisible = false;
  }

  startCreatingEvent(event: MouseEvent, endDate?: Date) {
    if (!this.selectedDate) return;

    // Default duration is 30 minutes if not specified
    const finalEndDate = endDate || new Date(new Date(this.selectedDate).getTime() + 30 * 60000);

    this.popoverData = {
      title: 'New Event',
      description: '',
      location: '',
      startDate: this.selectedDate,
      endDate: finalEndDate,
      subscribeByDefault: false,
    };

    // Calculate position based on the click/drag event
    this.calculatePopoverPosition(event);
    this.isPopoverVisible = true;
  }

  private calculatePopoverPosition(event: MouseEvent) {
    const container = this.el.nativeElement.querySelector('.calendar-container');
    const containerRect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };

    let x = event.clientX - containerRect.left;
    let y = event.clientY - containerRect.top;
    let arrowSide: 'top' | 'left' | 'right' = 'top';

    const popoverWidth = 320;
    const popoverHeight = 400;
    const padding = 20;

    this.isMobilePopover = window.innerWidth <= 768;

    if (this.isMobilePopover) {
      this.popoverPosition = { x: 0, y: 0, arrowSide: 'top' };
      return;
    }

    if (this.viewMode === 'week' || this.viewMode === 'day') {
      // Find the column based on selectionDate instead of event.target to be "sticky"
      let column: HTMLElement | null = null;
      if (this.selectionDate) {
        const dayColumns = this.el.nativeElement.querySelectorAll('.day-column');
        const dayIndex = this.days.findIndex(d => this.isSameDate(d.date, this.selectionDate!));
        if (dayIndex !== -1) {
          // +1 because of time-axis being the first child in some layouts,
          // but here we use querySelectorAll so we check the actual index
          column = dayColumns[dayIndex] as HTMLElement;
        }
      }

      if (column) {
        const rect = column.getBoundingClientRect();
        const relativeRect = {
          left: rect.left - containerRect.left,
          right: rect.right - containerRect.left,
          top: rect.top - containerRect.top,
          bottom: rect.bottom - containerRect.top
        };

        const dayIndex = Array.from(column.parentElement?.children || []).indexOf(column) - 1;

        if (dayIndex <= 2) {
          x = relativeRect.right + 5;
          arrowSide = 'left';
        } else {
          x = relativeRect.left - popoverWidth - 5;
          arrowSide = 'right';
        }

        const selectionOverlay = column.querySelector('.selection-overlay');
        if (selectionOverlay) {
          const selectionRect = selectionOverlay.getBoundingClientRect();
          const relativeSelectionTop = selectionRect.top - containerRect.top;
          y = relativeSelectionTop + (selectionRect.height / 2) - 100;
        } else {
          y = (event.clientY - containerRect.top) - 50;
        }
      }
    } else {
      x = (event.clientX - containerRect.left) - (popoverWidth / 2);
      y = (event.clientY - containerRect.top) + 15;
      arrowSide = 'top';
    }

    // Boundary checks relative to container
    const maxWidth = containerRect.width || window.innerWidth;
    const maxHeight = containerRect.height || window.innerHeight;

    x = Math.max(padding, Math.min(x, maxWidth - popoverWidth - padding));
    y = Math.max(padding, Math.min(y, maxHeight - popoverHeight - padding));

    this.popoverPosition = { x, y, arrowSide };
  }

  cancelCreatingEvent() {
    this.isPopoverVisible = false;
    this.selectionDate = null;
    this.selectionStartHour = null;
    this.selectionEndHour = null;
    this.selectedDate = null;
  }

  submitEvent(data: EventCreateRequest) {
    if (!data.title || !data.startDate) return;

    this.eventService.createEvent(data).subscribe({
      next: () => {
        this.isPopoverVisible = false;
        this.selectedDate = null;
        this.selectionDate = null;
        this.selectionStartHour = null;
        this.selectionEndHour = null;
        this.generateCalendar();
      },
      error: (err) => console.error('Error creating event:', err)
    });
  }

  viewEventDetails(event: CalendarEvent) {
    this.router.navigate(['/event', 'calendar', event.id], {
      state: { event }
    });
  }
}
