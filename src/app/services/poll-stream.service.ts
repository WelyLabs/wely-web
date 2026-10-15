import { Injectable, inject } from '@angular/core';
import { KeycloakService } from 'keycloak-angular';
import { Observable, catchError, filter, map, takeWhile, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoggerService } from '../core/logging/logger.service';
import { SseStreamError, sseStream } from '../core/sse/sse-stream';
import { Poll, PollPayload, toPoll } from './event.service';

/** Statuses a retry cannot fix: the event is gone or not visible. */
const FINAL_STATUSES = [403, 404];

/** The stream was refused for good (403 or 404). */
export class PollStreamError extends Error {
  constructor(readonly status: number) {
    super(`Poll stream refused with HTTP ${status}`);
  }
}

/** Follows a date poll live over SSE. */
@Injectable({ providedIn: 'root' })
export class PollStreamService {
  private readonly keycloak = inject(KeycloakService);
  private readonly logger = inject(LoggerService);
  private readonly apiUrl = `${environment.apiUrl}/events-service/events`;

  /** The poll's current state, then each change; completes once it is closed. */
  follow(eventId: string): Observable<Poll> {
    return sseStream({
      url: `${this.apiUrl}/${eventId}/poll/stream`,
      token: () => this.keycloak.getToken(),
      finalStatuses: FINAL_STATUSES,
      onRetry: (delay, reason) =>
        this.logger.warn('PollStreamService', `Stream lost, retrying in ${delay} ms`, reason)
    }).pipe(
      filter(message => message.event === 'poll' || message.event === 'message'),
      map(message => toPoll(JSON.parse(message.data) as PollPayload)),
      takeWhile(poll => poll.status !== 'CLOSED', true),
      catchError((error: unknown) =>
        throwError(() => error instanceof SseStreamError ? new PollStreamError(error.status) : error))
    );
  }
}
