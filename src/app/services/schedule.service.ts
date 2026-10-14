import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { EventPayload, EventService, FeedEvent, FreeRange, FreeRangePayload, toDate, toFeedEvent } from './event.service';

/**
 * Schedule conflicts: which of the user's events a time overlaps, and moving an event out of one.
 * Anyone is told about a conflict with their own agenda; only an event's organizer may move it.
 */
@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private readonly http = inject(HttpClient);
  private readonly eventService = inject(EventService);
  private readonly apiUrl = `${environment.apiUrl}/events-service/events`;

  /** The user's events that a time overlaps, before it is saved; `excludedEventId` is left out. */
  checkConflicts(start: Date, end: Date, excludedEventId?: string): Observable<FeedEvent[]> {
    return this.http.post<EventPayload[]>(`${this.apiUrl}/me/conflicts`, { start, end, excludedEventId })
      .pipe(map(events => events.map(toFeedEvent)));
  }

  /** The user's events that overlap this one, whether they take part in it or not. */
  getConflicts(eventId: string): Observable<FeedEvent[]> {
    return this.http.get<EventPayload[]>(`${this.apiUrl}/${eventId}/conflicts`)
      .pipe(map(events => events.map(toFeedEvent)));
  }

  /** Organizer only: times when everyone taking part is free, closest to the current one first. */
  getProposals(eventId: string): Observable<FreeRange[]> {
    return this.http.get<FreeRangePayload[]>(`${this.apiUrl}/${eventId}/schedule/proposals`).pipe(
      map(ranges => ranges.flatMap(range => {
        const start = toDate(range.start);
        const end = toDate(range.end);
        return start && end ? [{ start, end }] : [];
      })));
  }

  /** Organizer only: moves the event; the others taking part are told in its group. */
  reschedule(eventId: string, start: Date, end: Date): Observable<FeedEvent> {
    return this.http.put<EventPayload>(`${this.apiUrl}/${eventId}/schedule`, { start, end }).pipe(
      map(toFeedEvent),
      tap(() => this.eventService.refreshEvents()));
  }
}
