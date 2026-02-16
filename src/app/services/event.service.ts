import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, map, Observable, tap } from 'rxjs';
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
    const mapSingleDate = (d: any) => {
      if (!d) return null;
      if (Array.isArray(d)) {
        return new Date(d[0], d[1] - 1, d[2], d[3] || 0, d[4] || 0, d[5] || 0);
      }
      const date = new Date(d);
      return isNaN(date.getTime()) ? null : date;
    };

    const startDate = mapSingleDate(event.startDate) || new Date();
    const endDate = mapSingleDate(event.endDate) || new Date(startDate.getTime() + 3600000); // Default +1h

    return { ...event, startDate, endDate };
  }
}
