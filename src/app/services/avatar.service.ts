import { Injectable, Signal, WritableSignal, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { LoggerService } from '../core/logging/logger.service';

/** wely-users signs picture URLs for an hour; they are reused for a little less. */
const URL_LIFETIME_MS = 50 * 60_000;
/** After a failed request, how long before the same ids are asked for again. */
const RETRY_AFTER_MS = 60_000;
/** Ids asked for within this window go out in one request. */
const BATCH_WINDOW_MS = 50;
/** wely-users answers for at most this many ids at once. */
const BATCH_SIZE = 100;

interface Entry {
  url: WritableSignal<string | null>;
  /** When the URL must be asked for again; 0 for never asked. */
  refreshAt: number;
}

/**
 * Profile pictures, by user id. Pictures are private: wely-users answers short-lived signed URLs,
 * not stable addresses, so every screen asks here rather than reading a URL off a DTO.
 *
 * `url(id)` returns a signal at once, null until the URL arrives (or for someone without a
 * picture). Ids asked for together go out in one request, and a URL is reused while it is valid,
 * so the browser keeps its cached image instead of fetching a new address each time.
 */
@Injectable({ providedIn: 'root' })
export class AvatarService {
  private readonly http = inject(HttpClient);
  private readonly logger = inject(LoggerService);
  private readonly apiUrl = `${environment.apiUrl}/user-service/avatars`;

  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  /** The user's picture URL, or null; refreshed on its own when the URL is about to expire. */
  url(userId: string | null | undefined): Signal<string | null> {
    if (!userId) {
      return NO_PICTURE;
    }
    let entry = this.entries.get(userId);
    if (!entry) {
      entry = { url: signal<string | null>(null), refreshAt: 0 };
      this.entries.set(userId, entry);
    }
    if (entry.refreshAt <= Date.now()) {
      entry.refreshAt = Date.now() + URL_LIFETIME_MS;
      this.request(userId);
    }
    return entry.url.asReadonly();
  }

  /** After the user's picture changed: the next read asks for the new one, and readers follow. */
  invalidate(userId: string): void {
    const entry = this.entries.get(userId);
    if (entry) {
      entry.refreshAt = Date.now() + URL_LIFETIME_MS;
      this.request(userId);
    }
  }

  private request(userId: string): void {
    this.pending.add(userId);
    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => this.flush(), BATCH_WINDOW_MS);
    }
  }

  private flush(): void {
    this.flushTimer = null;
    const ids = [...this.pending];
    this.pending.clear();
    for (let start = 0; start < ids.length; start += BATCH_SIZE) {
      const batch = ids.slice(start, start + BATCH_SIZE);
      this.http.post<Record<string, string>>(this.apiUrl, { userIds: batch }).subscribe({
        next: urls => batch.forEach(id => this.entries.get(id)?.url.set(urls[id] ?? null)),
        error: (error: unknown) => {
          this.logger.warn('AvatarService', 'Could not load profile pictures', error);
          batch.forEach(id => {
            const entry = this.entries.get(id);
            if (entry) {
              entry.refreshAt = Date.now() + RETRY_AFTER_MS;
            }
          });
        }
      });
    }
  }
}

const NO_PICTURE: Signal<string | null> = signal<string | null>(null).asReadonly();
