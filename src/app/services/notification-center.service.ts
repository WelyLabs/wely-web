import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { KeycloakService } from 'keycloak-angular';
import { Observable, Subject, Subscription } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoggerService } from '../core/logging/logger.service';
import { AuthService } from '../core/auth/auth.service';
import { SseMessage, SseStreamError, sseStream } from '../core/sse/sse-stream';
import { AppNotification, NotificationPreferences } from '../models/notification.model';

export const NOTIFICATIONS_PAGE_SIZE = 30;
const SCOPE = 'NotificationCenterService';
/** wely-notifications refuses the stream of a deleted account with 410. */
const GONE = 410;

type ReadRequest = { ids: string[] } | { groupKey: string } | { all: true };

/** Newest first, by creation date. */
const byNewest = (a: AppNotification, b: AppNotification) => b.createdAt.localeCompare(a.createdAt);

/**
 * The user's notifications: a first page, older pages on demand, and live updates over SSE.
 * Marking read is optimistic; the server's `unread` events keep the count honest.
 */
@Injectable({ providedIn: 'root' })
export class NotificationCenterService {
  private readonly http = inject(HttpClient);
  private readonly keycloak = inject(KeycloakService);
  private readonly logger = inject(LoggerService);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = `${environment.apiUrl}/notifications-service`;

  private readonly items = signal<AppNotification[]>([]);
  private readonly unread = signal(0);
  private readonly more = signal(false);
  private readonly busy = signal(false);
  private readonly arrivals = new Subject<AppNotification>();
  private connection?: Subscription;
  private firstPageLoaded = false;

  readonly notifications = this.items.asReadonly();
  readonly unreadCount = this.unread.asReadonly();
  readonly hasMore = this.more.asReadonly();
  readonly loading = this.busy.asReadonly();
  /** Each unread notification that arrives live, new or updated in place: for toasts. */
  readonly events$: Observable<AppNotification> = this.arrivals.asObservable();

  /** Opens the live stream once; each (re)connection reloads the first page, and a 410 means this account was deleted. */
  start(): void {
    if (this.connection) {
      return;
    }
    this.connection = sseStream({
      url: `${this.apiUrl}/notifications/stream`,
      token: () => this.keycloak.getToken(),
      finalStatuses: [GONE],
      onOpen: () => this.refresh(),
      onRetry: (delay, reason) => this.logger.warn(SCOPE, `Stream lost, retrying in ${delay} ms`, reason)
    }).subscribe({
      next: message => this.onMessage(message),
      error: (error: unknown) => {
        this.connection = undefined;
        if (error instanceof SseStreamError && error.status === GONE) {
          this.authService.leaveAfterAccountDeletion();
        }
      }
    });
  }

  stop(): void {
    this.connection?.unsubscribe();
    this.connection = undefined;
  }

  /** Loads the first page and merges it with what is already there. */
  refresh(): void {
    this.fetchPage(null).subscribe({
      next: page => {
        this.upsert(page);
        // Later refreshes only catch up: the older pages are loadMore's business.
        if (!this.firstPageLoaded) {
          this.firstPageLoaded = true;
          this.more.set(page.length === NOTIFICATIONS_PAGE_SIZE);
        }
      },
      error: (error: unknown) => this.logger.error(SCOPE, 'Could not load notifications', error)
    });
  }

  /** The page older than the last one loaded. */
  loadMore(): void {
    const last = this.items().at(-1);
    if (this.busy() || !this.more() || !last) {
      return;
    }
    this.busy.set(true);
    this.fetchPage(last.createdAt).subscribe({
      next: page => {
        this.upsert(page);
        this.more.set(page.length === NOTIFICATIONS_PAGE_SIZE);
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.logger.error(SCOPE, 'Could not load older notifications', error);
      }
    });
  }

  markRead(ids: readonly string[]): void {
    const wanted = new Set(ids);
    if (this.markLocally(item => wanted.has(item.id)) > 0) {
      this.send({ ids: [...wanted] });
    }
  }

  /**
   * Marks a conversation's (or any group's) notifications read, loaded or not. Always sent:
   * opened from a push on a cold start, the page may not know yet that it was unread.
   */
  markGroupRead(groupKey: string): void {
    this.markLocally(item => item.groupKey === groupKey);
    this.send({ groupKey });
  }

  markAllRead(): void {
    this.markLocally(() => true);
    this.unread.set(0);
    this.send({ all: true });
  }

  getPreferences(): Observable<NotificationPreferences> {
    return this.http.get<NotificationPreferences>(`${this.apiUrl}/preferences`);
  }

  savePreferences(preferences: NotificationPreferences): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/preferences`, preferences);
  }

  private fetchPage(before: string | null): Observable<AppNotification[]> {
    const params: Record<string, string | number> = { limit: NOTIFICATIONS_PAGE_SIZE };
    if (before) {
      params['before'] = before;
    }
    return this.http.get<AppNotification[]>(`${this.apiUrl}/notifications`, { params });
  }

  /** Marks the matching unread items read on screen; returns how many changed. */
  private markLocally(matches: (item: AppNotification) => boolean): number {
    const now = new Date().toISOString();
    let changed = 0;
    this.items.update(items => items.map(item => {
      if (item.readAt || !matches(item)) {
        return item;
      }
      changed++;
      return { ...item, readAt: now };
    }));
    this.unread.update(count => Math.max(0, count - changed));
    return changed;
  }

  private send(request: ReadRequest): void {
    this.http.post<void>(`${this.apiUrl}/notifications/read`, request).subscribe({
      error: (error: unknown) => {
        this.logger.error(SCOPE, 'Could not mark notifications read', error);
        this.reloadUnreadCount();
      }
    });
  }

  private reloadUnreadCount(): void {
    this.http.get<{ count: number }>(`${this.apiUrl}/notifications/unread-count`).subscribe({
      next: ({ count }) => this.unread.set(count),
      error: (error: unknown) => this.logger.error(SCOPE, 'Could not load the unread count', error)
    });
  }

  /** Replaces items by id, adds the others; a fresh array, never the one handed out. */
  private upsert(incoming: readonly AppNotification[]): void {
    const ids = new Set(incoming.map(item => item.id));
    this.items.update(items => [...incoming, ...items.filter(item => !ids.has(item.id))].sort(byNewest));
  }

  private onMessage(message: SseMessage): void {
    try {
      if (message.event === 'notification') {
        const notification = JSON.parse(message.data) as AppNotification;
        this.upsert([notification]);
        if (!notification.readAt) {
          this.arrivals.next(notification);
        }
      } else if (message.event === 'unread') {
        this.unread.set((JSON.parse(message.data) as { count: number }).count);
      }
    } catch (error) {
      this.logger.error(SCOPE, 'Unreadable stream event', error);
    }
  }
}
