import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, map, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface EventCreateRequest {
  title: string;
  startDate: Date;
  endDate?: Date;
  location: string;
  image?: string;
  description?: string;
  subscribeByDefault: boolean;
}

export interface FeedEvent {
  id: string;
  title: string;
  organizerId: string;
  startDate: Date;
  endDate: Date;
  location: string;
  image: string;
  description: string;
}

/**
 * An event as it arrives on the wire.
 *
 * <p>Dates are not `Date` yet: the backend serialises `Instant`, which reaches the
 * client either as an ISO string or, depending on the Jackson configuration, as a
 * `[year, month, day, hour, minute, second]` array. Naming that shape here is what
 * lets {@link EventService} convert it without `any`.
 */
interface EventPayload extends Omit<FeedEvent, 'startDate' | 'endDate'> {
  startDate: string | number[] | null;
  endDate: string | number[] | null;
}

/** Fallback duration when the backend sends no end date. */
const DEFAULT_DURATION_MS = 3_600_000;

@Injectable({ providedIn: 'root' })
export class EventService {
  private readonly http = inject(HttpClient);

  private readonly subscribedEventsSubject = new BehaviorSubject<FeedEvent[]>([]);
  readonly subscribedEvents$ = this.subscribedEventsSubject.asObservable();

  private readonly feedEventsSubject = new BehaviorSubject<FeedEvent[]>([]);
  readonly feedEvents$ = this.feedEventsSubject.asObservable();

  private readonly apiUrl = `${environment.apiUrl}/events-service/events`;

  /**
   * Loads both lists.
   *
   * <p>Called by the components that display them, not from the constructor. This
   * service is root-provided, so fetching on construction issued both requests at
   * bootstrap — including for signed-out visitors on the landing page, where they
   * can only come back 401.
   */
  refreshEvents(): void {
    this.http
      .get<EventPayload[]>(`${this.apiUrl}/me/subscribed`)
      .pipe(map((events) => events.map((event) => this.toFeedEvent(event))))
      .subscribe((events) => this.subscribedEventsSubject.next(events));

    this.http
      .get<EventPayload[]>(`${this.apiUrl}/me/feed`)
      .pipe(map((events) => events.map((event) => this.toFeedEvent(event))))
      .subscribe((events) => this.feedEventsSubject.next(events));
  }

  createEvent(event: EventCreateRequest): Observable<FeedEvent> {
    return this.http.post<EventPayload>(this.apiUrl, event).pipe(
      map((created) => this.toFeedEvent(created)),
      tap(() => this.refreshEvents()),
    );
  }

  toggleSubscription(event: FeedEvent): Observable<FeedEvent> {
    return this.http.post<EventPayload>(`${this.apiUrl}/${event.id}/subscribe`, {}).pipe(
      map((updated) => this.toFeedEvent(updated)),
      tap(() => this.refreshEvents()),
    );
  }

  private toFeedEvent(payload: EventPayload): FeedEvent {
    const startDate = this.toDate(payload.startDate) ?? new Date();
    const endDate =
      this.toDate(payload.endDate) ?? new Date(startDate.getTime() + DEFAULT_DURATION_MS);

    return { ...payload, startDate, endDate };
  }

  private toDate(value: string | number[] | null): Date | null {
    if (!value) {
      return null;
    }

    if (Array.isArray(value)) {
      const [year, month, day, hour = 0, minute = 0, second = 0] = value;
      // Month is 1-based on the wire, 0-based in Date.
      return new Date(year, month - 1, day, hour, minute, second);
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
