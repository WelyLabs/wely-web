import { HttpClient } from '@angular/common/http';
import { Injectable, Signal, WritableSignal, inject, signal, untracked } from '@angular/core';
import { Observable, forkJoin, map, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoggerService } from '../core/logging/logger.service';
import { DeletedUsersRequest, DeletedUsersResponse } from '../models/account.model';

/** Ids asked for within this window go out in one request. */
const BATCH_WINDOW_MS = 50;
/** wely-users answers for at most this many ids at once. */
const BATCH_SIZE = 100;
/** A live account is asked about again after this long. */
const RECHECK_AFTER_MS = 10 * 60_000;
/** After a failed request, how long before the same ids are asked for again. */
const RETRY_AFTER_MS = 60_000;
/** Consecutive failures after which an id is no longer retried on its own, only when a screen asks again. */
const MAX_FAILED_ATTEMPTS = 3;

interface Entry {
  deleted: WritableSignal<boolean>;
  /** When to ask again; 0 for never asked, Infinity once the deletion is confirmed. */
  checkAt: number;
  /** Requests in a row that failed for this id. */
  failures: number;
}

/**
 * Which user ids are deleted accounts, as wely-users knows them. Screens ask only for ids their own
 * directory could not resolve; a confirmed deletion is kept for the session, since it is permanent.
 */
@Injectable({ providedIn: 'root' })
export class DeletedUsersService {
  private readonly http = inject(HttpClient);
  private readonly logger = inject(LoggerService);
  private readonly apiUrl = `${environment.apiUrl}/user-service/users/deleted`;

  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  /** False until wely-users confirms the deletion; writes no signal synchronously, so it is safe inside computed(). */
  isDeleted(userId: string | null | undefined): Signal<boolean> {
    if (!userId) {
      return NOT_DELETED;
    }
    const entry = this.entry(userId);
    if (entry.checkAt <= Date.now()) {
      this.enqueue(userId);
    }
    return entry.deleted.asReadonly();
  }

  /** One-off check of one id, answered from the cache when its deletion is already confirmed. */
  check(userId: string): Observable<boolean> {
    return this.deletedAmong([userId]).pipe(map(deleted => deleted.has(userId)));
  }

  /** The deleted accounts among these ids, asked at once; errors are left to the caller. */
  deletedAmong(userIds: readonly string[]): Observable<ReadonlySet<string>> {
    const unique = [...new Set(userIds)];
    const known = unique.filter(id => this.entries.get(id)?.checkAt === Infinity);
    const unknown = unique.filter(id => !known.includes(id));
    if (unknown.length === 0) {
      return of(new Set(known));
    }
    const batches: Observable<string[]>[] = [];
    for (let start = 0; start < unknown.length; start += BATCH_SIZE) {
      const batch = unknown.slice(start, start + BATCH_SIZE);
      batches.push(this.ask(batch).pipe(map(deleted => {
        this.remember(batch, deleted);
        return [...deleted];
      })));
    }
    return forkJoin(batches).pipe(map(answers => new Set([...known, ...answers.flat()])));
  }

  private entry(userId: string): Entry {
    let entry = this.entries.get(userId);
    if (!entry) {
      entry = { deleted: untracked(() => signal(false)), checkAt: 0, failures: 0 };
      this.entries.set(userId, entry);
    }
    return entry;
  }

  private enqueue(userId: string): void {
    this.entry(userId).checkAt = Date.now() + RECHECK_AFTER_MS;
    this.pending.add(userId);
    this.flushTimer ??= setTimeout(() => this.flush(), BATCH_WINDOW_MS);
  }

  private flush(): void {
    this.flushTimer = null;
    const ids = [...this.pending];
    this.pending.clear();
    for (let start = 0; start < ids.length; start += BATCH_SIZE) {
      const batch = ids.slice(start, start + BATCH_SIZE);
      this.ask(batch).subscribe({
        next: deleted => this.remember(batch, deleted),
        error: (error: unknown) => this.retryLater(batch, error)
      });
    }
  }

  /** Asks again after a minute without waiting for a screen to, since the screens' signals did not change. */
  private retryLater(batch: readonly string[], error: unknown): void {
    this.logger.warn('DeletedUsersService', 'Could not check for deleted accounts', error);
    const retried = batch.filter(id => {
      const entry = this.entry(id);
      entry.checkAt = Date.now() + RETRY_AFTER_MS;
      entry.failures++;
      return entry.failures < MAX_FAILED_ATTEMPTS;
    });
    if (retried.length > 0) {
      // An id answered meanwhile, by deletedAmong() for instance, has no failure left and is skipped.
      setTimeout(() => retried.filter(id => this.entry(id).failures > 0).forEach(id => this.enqueue(id)), RETRY_AFTER_MS);
    }
  }

  private ask(userIds: string[]): Observable<ReadonlySet<string>> {
    const body: DeletedUsersRequest = { userIds };
    return this.http.post<DeletedUsersResponse>(this.apiUrl, body)
      .pipe(map(response => new Set(response?.deletedIds ?? [])));
  }

  private remember(batch: readonly string[], deleted: ReadonlySet<string>): void {
    for (const id of batch) {
      const entry = this.entry(id);
      const isDeleted = deleted.has(id);
      entry.checkAt = isDeleted ? Infinity : Date.now() + RECHECK_AFTER_MS;
      entry.failures = 0;
      entry.deleted.set(isDeleted);
    }
  }
}

const NOT_DELETED: Signal<boolean> = signal(false).asReadonly();
