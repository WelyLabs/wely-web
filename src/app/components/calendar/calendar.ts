import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import { Event, FeedEvent } from '../../services/event.service';
import { Subscription } from 'rxjs';

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  hasEvents: boolean;
}

interface CalendarEvent {
  id: number;
  title: string;
  time: string;
  description: string;
  date: Date;
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  templateUrl: './calendar.html',
  styleUrl: './calendar.scss',
})
export class CalendarComponent implements OnInit, OnDestroy {
  currentDate = new Date();
  days: CalendarDay[] = [];
  weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  hours = Array.from({ length: 24 }, (_, i) => i);
  currentTimePosition = 0;
  private timeUpdateInterval?: any;
  viewMode: 'month' | 'week' | 'day' = 'month';

  selectedDate: Date | null = null;
  selectedEvents: CalendarEvent[] = [];

  // Personal events
  personalEvents: CalendarEvent[] = [
    { id: 1, title: 'Team Meeting', time: '10:00 AM', description: 'Weekly sync with the team.', date: new Date() },
    { id: 2, title: 'Lunch with Client', time: '12:30 PM', description: 'Discuss project roadmap.', date: new Date() },
    { id: 3, title: 'Code Review', time: '03:00 PM', description: 'Review PR #123.', date: new Date() }
  ];

  // All events (personal + subscribed)
  events: CalendarEvent[] = [];
  private subscription?: Subscription;

  // Touch event tracking for swipe-to-dismiss
  private touchStartY = 0;
  private touchCurrentY = 0;
  private isDragging = false;

  constructor(private eventService: Event, private router: Router) { }

  ngOnInit() {
    this.subscription = this.eventService.events$.subscribe(feedEvents => {
      // Merge personal events with subscribed feed events
      const subscribedEvents = feedEvents
        .filter(e => e.subscribed)
        .map(e => this.convertFeedEventToCalendarEvent(e));

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
    this.isDragging = true;
  }

  onDetailsTouchMove(event: TouchEvent) {
    if (!this.isDragging) return;

    this.touchCurrentY = event.touches[0].clientY;
    const deltaY = this.touchCurrentY - this.touchStartY;

    // Only allow downward swipe
    if (deltaY > 0) {
      // Prevent Safari's pull-to-refresh
      event.preventDefault();

      const detailsSection = event.currentTarget as HTMLElement;
      detailsSection.style.transform = `translateY(${deltaY}px)`;
      detailsSection.style.transition = 'none';
    }
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
    return {
      id: feedEvent.id + 1000, // Offset to avoid ID conflicts
      title: feedEvent.title,
      time: 'All Day',
      description: feedEvent.description,
      date: feedEvent.date
    };
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

    const startingDayOfWeek = firstDay.getDay();
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
        hasEvents: this.events.some(e => this.isSameDate(e.date, date))
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
    const dayOfWeek = current.getDay();
    const firstDayOfWeek = new Date(current.setDate(current.getDate() - dayOfWeek));

    for (let i = 0; i < 7; i++) {
      const date = new Date(firstDayOfWeek);
      date.setDate(firstDayOfWeek.getDate() + i);
      this.days.push({
        date: date,
        isCurrentMonth: date.getMonth() === this.currentDate.getMonth(),
        isToday: this.isSameDate(date, new Date()),
        hasEvents: this.events.some(e => this.isSameDate(e.date, date))
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
      hasEvents: this.events.some(e => this.isSameDate(e.date, date))
    });
  }

  isSameDate(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate();
  }

  getEventsForDay(date: Date): CalendarEvent[] {
    return this.events.filter(event => this.isSameDate(event.date, date));
  }

  getEventsForHour(date: Date, hour: number): CalendarEvent[] {
    // This is a simplified version since our time is stored as a string like '10:00 AM'
    // In a real app, this would use a proper Date/Time object
    return this.events.filter(event => {
      if (!this.isSameDate(event.date, date)) return false;

      const timeStr = event.time.toLowerCase();
      if (timeStr === 'all day') return hour === 0; // Show all day events at midnight or a special slot

      const match = timeStr.match(/(\d+):/);
      if (match) {
        let eventHour = parseInt(match[1]);
        const isPM = timeStr.includes('pm');
        if (isPM && eventHour !== 12) eventHour += 12;
        if (!isPM && eventHour === 12) eventHour = 0;
        return eventHour === hour;
      }
      return false;
    });
  }

  getEventMinuteOffset(event: CalendarEvent): number {
    // Extract minutes from time string like '03:00 PM' or '12:30 PM'
    const timeStr = event.time.toLowerCase();
    if (timeStr === 'all day') return 0;

    const match = timeStr.match(/(\d+):(\d+)/);
    if (match) {
      const minutes = parseInt(match[2]);
      // Return percentage offset within the hour (0-100%)
      return (minutes / 60) * 100;
    }
    return 0;
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

  selectDate(day: CalendarDay) {
    this.selectedDate = day.date;
    this.selectedEvents = this.events.filter(e => this.isSameDate(e.date, day.date));
  }

  closeDetails() {
    this.selectedDate = null;
  }

  viewEventDetails(event: CalendarEvent) {
    this.router.navigate(['/event', 'calendar', event.id], {
      state: { event }
    });
  }
}
