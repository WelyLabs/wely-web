import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, map, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Coordinates, MapArea } from '../models/place.model';

/** Who may see an event besides those taking part: everyone, the organizer's friends, or nobody. */
export type Visibility = 'PUBLIC' | 'FRIENDS' | 'PRIVATE';

export interface EventCreateRequest {
  title: string;
  startDate: Date;
  endDate?: Date;
  location: string;
  /** Set when the location was picked on the map. */
  coordinates?: Coordinates | null;
  description?: string;
  subscribeByDefault: boolean;
  /** FRIENDS when left out. */
  visibility?: Visibility;
  /** 2 to 5 proposed slots: the event then opens as a date poll. */
  candidateSlots?: { start: Date; end: Date }[];
}

/** One voter's answer for one proposed slot. */
export type PollAnswer = 'YES' | 'MAYBE' | 'NO';

/** A proposed slot and who answered what, by user id. */
export interface PollSlot {
  id: string;
  start: Date;
  end: Date;
  yes: string[];
  maybe: string[];
  no: string[];
}

/** A date poll: open while people vote, closed once the organizer fixed a slot. */
export interface Poll {
  status: 'OPEN' | 'CLOSED';
  fixedSlotId: string | null;
  slots: PollSlot[];
}

interface PollSlotPayload extends Omit<PollSlot, 'start' | 'end'> {
  start: string | number[];
  end: string | number[];
}

/** A poll as it arrives on the wire, dates not converted yet. */
export interface PollPayload extends Omit<Poll, 'slots'> {
  slots: PollSlotPayload[];
}

export interface FeedEvent {
  id: string;
  title: string;
  organizerId: string;
  startDate: Date;
  endDate: Date;
  location: string;
  /** Absent when the location was typed rather than picked on the map. */
  coordinates?: Coordinates | null;
  /** The cover: a signed URL, a `/demo/...` path, or null when there is none. */
  image: string | null;
  description: string;
  visibility?: Visibility;
  /** The date poll, when the event was created with several candidate slots. */
  poll?: Poll | null;
}

/**
 * One event of a friend's calendar, as much as the friendship allows: always when, the rest
 * only if disclosed.
 */
/** Who takes part in an event, as the viewer may know it. */
export interface EventParticipants {
  count: number;
  /** Everyone, in joining order — only for those who take part or organize; empty otherwise. */
  participantIds: string[];
  /** The viewer's friends among the participants. */
  friendsGoingIds: string[];
}

export interface FriendCalendarEntry {
  start: Date;
  end: Date;
  eventId: string | null;
  title: string | null;
  location: string | null;
  description: string | null;
}

interface FriendCalendarEntryPayload extends Omit<FriendCalendarEntry, 'start' | 'end'> {
  start: string | number[];
  end: string | number[];
}

/**
 * An event as it arrives on the wire.
 *
 * <p>Dates are not `Date` yet: the backend serialises `Instant`, which reaches the
 * client either as an ISO string or, depending on the Jackson configuration, as a
 * `[year, month, day, hour, minute, second]` array. Naming that shape here is what
 * lets {@link EventService} convert it without `any`.
 */
/** Someone the member went out with, and how often. */
export interface Companion {
  userId: string;
  outingsTogether: number;
}

/** A place the member went to; no coordinates when it was typed rather than picked on the map. */
export interface VisitedPlace {
  label: string;
  coordinates: Coordinates | null;
  visits: number;
}

/** The member's balance on one event: positive when owed, negative when owing. */
export interface EventBalance {
  eventId: string;
  title: string;
  netCents: number;
}

/** What the profile page shows of the member's life in Wely; computed by wely-events. */
export interface ProfileSummary {
  outingsThisYear: number;
  outingsThisMonth: number;
  organizedThisYear: number;
  placesThisYear: number;
  upcoming: FeedEvent[];
  memories: FeedEvent[];
  pastCount: number;
  circle: Companion[];
  places: VisitedPlace[];
  balances: EventBalance[];
}

interface ProfileSummaryPayload extends Omit<ProfileSummary, 'upcoming' | 'memories'> {
  upcoming: EventPayload[];
  memories: EventPayload[];
}

/** What the viewer and a friend share in Wely, and what the friend has planned that the viewer may join. */
export interface FriendOverview {
  outingsTogether: number;
  upcomingTogether: FeedEvent[];
  memoriesTogether: FeedEvent[];
  friendUpcoming: FeedEvent[];
}

interface FriendOverviewPayload extends Omit<FriendOverview, 'upcomingTogether' | 'memoriesTogether' | 'friendUpcoming'> {
  upcomingTogether: EventPayload[];
  memoriesTogether: EventPayload[];
  friendUpcoming: EventPayload[];
}

interface EventPayload extends Omit<FeedEvent, 'startDate' | 'endDate' | 'poll'> {
  startDate: string | number[] | null;
  endDate: string | number[] | null;
  poll?: PollPayload | null;
}

/** A search for a slot where the user and some friends are all free. */
export interface FreeSlotSearch {
  friendIds: string[];
  start: Date;
  end: Date;
  durationMinutes: number;
}

/** A period during which everyone searched for is free. */
export interface FreeRange {
  start: Date;
  end: Date;
}

interface FreeRangePayload {
  start: string | number[];
  end: string | number[];
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

  /** Sets the event's cover, already cropped and scaled down; the organizer only. */
  uploadCover(eventId: string, cover: Blob): Observable<FeedEvent> {
    const form = new FormData();
    form.append('file', cover, 'cover.jpg');
    return this.http.post<EventPayload>(`${this.apiUrl}/${eventId}/cover`, form).pipe(
      map((event) => this.toFeedEvent(event)),
      tap(() => this.refreshEvents()),
    );
  }

  removeCover(eventId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${eventId}/cover`).pipe(tap(() => this.refreshEvents()));
  }

  /** One event, if the user may see it; a 404 otherwise. */
  getEvent(id: string): Observable<FeedEvent> {
    return this.http.get<EventPayload>(`${this.apiUrl}/${id}`).pipe(
      map((event) => this.toFeedEvent(event)),
    );
  }

  getParticipants(id: string): Observable<EventParticipants> {
    return this.http.get<EventParticipants>(`${this.apiUrl}/${id}/participants`);
  }

  toggleSubscription(event: FeedEvent): Observable<FeedEvent> {
    return this.http.post<EventPayload>(`${this.apiUrl}/${event.id}/subscribe`, {}).pipe(
      map((updated) => this.toFeedEvent(updated)),
      tap(() => this.refreshEvents()),
    );
  }

  /** Replaces the caller's whole ballot: every answer they gave, not only the last one. */
  vote(eventId: string, answers: Record<string, PollAnswer>): Observable<Poll> {
    return this.http.put<PollPayload>(`${this.apiUrl}/${eventId}/poll/ballot`, { answers }).pipe(
      map((poll) => toPoll(poll)),
    );
  }

  /** Fixes the event on one slot and closes the poll; the organizer only. */
  fixDate(eventId: string, slotId: string): Observable<FeedEvent> {
    return this.http.post<EventPayload>(`${this.apiUrl}/${eventId}/poll/fix`, { slotId }).pipe(
      map((event) => this.toFeedEvent(event)),
      tap(() => this.refreshEvents()),
    );
  }

  /** Open polls the user organizes, voted on or takes part in. */
  getMyPolls(): Observable<FeedEvent[]> {
    return this.http.get<EventPayload[]>(`${this.apiUrl}/me/polls`).pipe(
      map((events) => events.map((event) => this.toFeedEvent(event))),
    );
  }

  /** Upcoming events the user may see, inside the area on the map. */
  getMapEvents(area: MapArea): Observable<FeedEvent[]> {
    const params = new HttpParams()
      .set('south', area.south).set('west', area.west)
      .set('north', area.north).set('east', area.east);
    return this.http.get<EventPayload[]>(`${this.apiUrl}/map`, { params }).pipe(
      map((events) => events.map((event) => this.toFeedEvent(event))),
    );
  }

  /** Free ranges, inside the search period, where the user and every friend are free. */
  findFreeSlots(search: FreeSlotSearch): Observable<FreeRange[]> {
    return this.http.post<FreeRangePayload[]>(`${this.apiUrl}/me/free-slots`, search).pipe(
      map((ranges) => ranges.flatMap((range) => {
        const start = this.toDate(range.start);
        const end = this.toDate(range.end);
        return start && end ? [{ start, end }] : [];
      })),
    );
  }

  /** A friend's events between `from` and `to`, disclosed according to how close you are. */
  getFriendCalendar(friendId: string, from: Date, to: Date): Observable<FriendCalendarEntry[]> {
    const params = { from: from.toISOString(), to: to.toISOString() };
    return this.http
      .get<FriendCalendarEntryPayload[]>(`${this.apiUrl}/users/${friendId}/calendar`, { params })
      .pipe(map((entries) => entries.flatMap((entry) => {
        const start = this.toDate(entry.start);
        const end = this.toDate(entry.end);
        return start && end ? [{ ...entry, start, end }] : [];
      })));
  }

  /** The caller's own profile summary: their outings, circle, places and accounts. */
  getMySummary(): Observable<ProfileSummary> {
    return this.http.get<ProfileSummaryPayload>(`${this.apiUrl}/me/summary`).pipe(map(summary => ({
      ...summary,
      upcoming: summary.upcoming.map(event => this.toFeedEvent(event)),
      memories: summary.memories.map(event => this.toFeedEvent(event))
    })));
  }

  /** Outings shared with a friend and the friend's upcoming ones; 403 when not friends. */
  getFriendOverview(friendId: string): Observable<FriendOverview> {
    return this.http.get<FriendOverviewPayload>(`${this.apiUrl}/users/${friendId}/overview`).pipe(map(overview => ({
      outingsTogether: overview.outingsTogether,
      upcomingTogether: (overview.upcomingTogether ?? []).map(event => this.toFeedEvent(event)),
      memoriesTogether: (overview.memoriesTogether ?? []).map(event => this.toFeedEvent(event)),
      friendUpcoming: (overview.friendUpcoming ?? []).map(event => this.toFeedEvent(event))
    })));
  }

  private toFeedEvent(payload: EventPayload): FeedEvent {
    const startDate = this.toDate(payload.startDate) ?? new Date();
    const endDate =
      this.toDate(payload.endDate) ?? new Date(startDate.getTime() + DEFAULT_DURATION_MS);

    return { ...payload, startDate, endDate, poll: payload.poll ? toPoll(payload.poll) : null };
  }

  private toDate(value: string | number[] | null): Date | null {
    return toDate(value);
  }
}

/** A wire date (ISO string or `[y, M, d, h, m, s]` array) as a Date, or null when unreadable. */
export function toDate(value: string | number[] | null): Date | null {
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

/** A poll from the wire, slots with unreadable dates dropped. */
export function toPoll(payload: PollPayload): Poll {
  return {
    status: payload.status,
    fixedSlotId: payload.fixedSlotId ?? null,
    slots: (payload.slots ?? []).flatMap((slot) => {
      const start = toDate(slot.start);
      const end = toDate(slot.end);
      return start && end
        ? [{ id: slot.id, start, end, yes: slot.yes ?? [], maybe: slot.maybe ?? [], no: slot.no ?? [] }]
        : [];
    }),
  };
}
