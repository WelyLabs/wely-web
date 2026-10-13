import { Injectable, inject } from '@angular/core';
import { KeycloakService } from 'keycloak-angular';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoggerService } from '../core/logging/logger.service';
import { Poll, PollPayload, toPoll } from './event.service';

/** First reconnection delay, doubled on each failure up to the cap. */
const FIRST_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
/** Statuses a retry cannot fix: the event is gone or not visible. */
const FINAL_STATUSES = [403, 404];

/** The stream was refused for good (403 or 404). */
export class PollStreamError extends Error {
  constructor(readonly status: number) {
    super(`Poll stream refused with HTTP ${status}`);
  }
}

/** One dispatched server-sent event. */
export interface SseMessage {
  event: string;
  data: string;
}

/** Incremental `text/event-stream` parser: chunks may cut lines anywhere. */
export class SseParser {
  private buffer = '';
  private eventName = '';
  private dataLines: string[] = [];

  /** Feeds a decoded chunk and returns the events it completed. */
  push(chunk: string): SseMessage[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    const messages: SseMessage[] = [];
    for (const raw of lines) {
      const message = this.line(raw.endsWith('\r') ? raw.slice(0, -1) : raw);
      if (message) {
        messages.push(message);
      }
    }
    return messages;
  }

  private line(line: string): SseMessage | null {
    if (line === '') {
      const message = this.dataLines.length > 0
        ? { event: this.eventName || 'message', data: this.dataLines.join('\n') }
        : null;
      this.eventName = '';
      this.dataLines = [];
      return message;
    }
    if (line.startsWith(':')) {
      return null;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }
    if (field === 'event') {
      this.eventName = value;
    } else if (field === 'data') {
      this.dataLines.push(value);
    }
    return null;
  }
}

/**
 * Follows a date poll live over SSE. Read with fetch: EventSource cannot send the bearer token.
 */
@Injectable({ providedIn: 'root' })
export class PollStreamService {
  private readonly keycloak = inject(KeycloakService);
  private readonly logger = inject(LoggerService);
  private readonly apiUrl = `${environment.apiUrl}/events-service/events`;

  /** The poll's current state, then each change; completes once it is closed. */
  follow(eventId: string): Observable<Poll> {
    return new Observable<Poll>(subscriber => {
      const controller = new AbortController();
      let retryTimer: ReturnType<typeof setTimeout> | undefined;
      let delay = FIRST_RETRY_MS;

      const reconnect = (reason: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        this.logger.warn('PollStreamService', `Stream lost, retrying in ${delay} ms`, reason);
        retryTimer = setTimeout(() => void connect(), delay);
        delay = Math.min(delay * 2, MAX_RETRY_MS);
      };

      const connect = async () => {
        try {
          const token = await this.keycloak.getToken();
          const response = await fetch(`${this.apiUrl}/${eventId}/poll/stream`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
            signal: controller.signal
          });
          if (FINAL_STATUSES.includes(response.status)) {
            subscriber.error(new PollStreamError(response.status));
            return;
          }
          if (!response.ok || !response.body) {
            reconnect(`HTTP ${response.status}`);
            return;
          }
          delay = FIRST_RETRY_MS;
          if (await this.read(response.body, poll => subscriber.next(poll))) {
            subscriber.complete();
          } else {
            reconnect('stream ended');
          }
        } catch (error) {
          reconnect(error);
        }
      };

      void connect();
      return () => {
        controller.abort();
        clearTimeout(retryTimer);
      };
    });
  }

  /** Reads the stream to its end; true when it delivered a closed poll. */
  private async read(body: ReadableStream<Uint8Array>, emit: (poll: Poll) => void): Promise<boolean> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return false;
      }
      for (const message of parser.push(decoder.decode(value, { stream: true }))) {
        if (message.event !== 'poll' && message.event !== 'message') {
          continue;
        }
        const poll = toPoll(JSON.parse(message.data) as PollPayload);
        emit(poll);
        if (poll.status === 'CLOSED') {
          await reader.cancel();
          return true;
        }
      }
    }
  }
}
