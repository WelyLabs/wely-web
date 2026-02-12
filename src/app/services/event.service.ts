import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, map, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface EventCreateRequest {
  title: string;
  date: Date;
  location: string;
  image?: string;
  description?: string;
  subscribeByDefault: boolean;
}

export interface FeedEvent {
  id: string;
  title: string;
  organizerId: string;
  date: Date;
  location: string;
  image: string;
  description: string;
}

@Injectable({
  providedIn: 'root',
})
export class EventService {
  private subscribedEventsSubject = new BehaviorSubject<FeedEvent[]>([]);
  subscribedEvents$ = this.subscribedEventsSubject.asObservable();

  private feedEventsSubject = new BehaviorSubject<FeedEvent[]>([]);
  feedEvents$ = this.feedEventsSubject.asObservable();

  private readonly API_URL = `${environment.apiUrl}/events-service/events`;

  constructor(private http: HttpClient) {
    this.refreshEvents();
  }

  refreshEvents(): void {
    this.http.get<FeedEvent[]>(`${this.API_URL}/me/subscribed`).pipe(
      map((events: any[]) => events.map((e: any) => this.mapDate(e)))
    ).subscribe((events: FeedEvent[]) => {
      this.subscribedEventsSubject.next(events);
    });

    this.http.get<FeedEvent[]>(`${this.API_URL}/me/feed`).pipe(
      map((events: any[]) => events.map((e: any) => this.mapDate(e)))
    ).subscribe((events: FeedEvent[]) => {
      this.feedEventsSubject.next(events);
    });
  }

  createEvent(event: EventCreateRequest): Observable<FeedEvent> {
    return this.http.post<FeedEvent>(this.API_URL, event).pipe(
      map((e: any) => this.mapDate(e)),
      tap(() => this.refreshEvents())
    );
  }

  toggleSubscription(event: FeedEvent): Observable<FeedEvent> {
    return this.http.post<FeedEvent>(`${this.API_URL}/${event.id}/subscribe`, {}).pipe(
      map((e: any) => this.mapDate(e)),
      tap(() => this.refreshEvents())
    );
  }

  private mapDate(event: any): FeedEvent {
    if (!event.date) return event;

    let date: Date;
    if (Array.isArray(event.date)) {
      // Jackson LocalDateTime format: [year, month, day, hour, minute, second]
      // Month in JS is 0-indexed
      date = new Date(
        event.date[0],
        event.date[1] - 1,
        event.date[2],
        event.date[3] || 0,
        event.date[4] || 0,
        event.date[5] || 0
      );
    } else {
      // ISO string or already a Date (though unlikely from JSON)
      date = new Date(event.date);
    }

    return { ...event, date };
  }
}
