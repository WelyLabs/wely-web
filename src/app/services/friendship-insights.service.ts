import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { FriendshipMemories, ReunionCandidate } from '../models/friendship-insights.model';
import { allDayLocalRange } from '../core/ui/all-day';
import { toDate } from './event.service';

/** One entry of an intimate friend's calendar, as « Mon cercle » lays it out. */
export interface CircleEntry {
  userId: string;
  start: Date;
  end: Date;
  allDay: boolean;
  eventId: string | null;
  title: string | null;
  location: string | null;
  description: string | null;
}

interface CircleEntryPayload extends Omit<CircleEntry, 'start' | 'end' | 'allDay'> {
  start: string | number[];
  end: string | number[];
  allDay?: boolean;
}

/** wely-events answers the circle for at most this many days at once. */
export const MAX_CIRCLE_DAYS = 62;

/**
 * What wely-events reads off the friendship graph: friends not seen for a while, a friendship's
 * memories and the intimates' calendars.
 */
@Injectable({ providedIn: 'root' })
export class FriendshipInsightsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/events-service/events/me`;

  /** Up to three close friends not seen for a while, the longest first. */
  getReunions(): Observable<ReunionCandidate[]> {
    return this.http.get<ReunionCandidate[]>(`${this.apiUrl}/reunions`);
  }

  /** « Plus tard »: that friend is not suggested again for 30 days. */
  dismissReunion(friendId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/reunions/${encodeURIComponent(friendId)}/dismiss`, {});
  }

  /** What the caller and a friend shared; 404 when they are not friends. */
  getMemories(friendId: string): Observable<FriendshipMemories> {
    return this.http.get<FriendshipMemories>(`${this.apiUrl}/friendships/${encodeURIComponent(friendId)}/memories`);
  }

  /** Every intimate friend's entries between `from` and `to`; all-day ones on their local days. */
  getCircle(from: Date, to: Date): Observable<CircleEntry[]> {
    const params = { from: from.toISOString(), to: to.toISOString() };
    return this.http.get<CircleEntryPayload[]>(`${this.apiUrl}/circle`, { params }).pipe(
      map(entries => entries.flatMap(entry => {
        const start = toDate(entry.start);
        const end = toDate(entry.end);
        if (!start || !end) {
          return [];
        }
        const allDay = entry.allDay === true;
        const range = allDay ? allDayLocalRange(start, end) : { start, end };
        return [{ ...entry, allDay, start: range.start, end: range.end }];
      }))
    );
  }
}
