import { Observable } from 'rxjs';

/** First reconnection delay, doubled on each failure up to the cap. */
export const FIRST_RETRY_MS = 1_000;
export const MAX_RETRY_MS = 30_000;

/** The stream was refused with a status a retry cannot fix. */
export class SseStreamError extends Error {
  constructor(readonly status: number) {
    super(`Stream refused with HTTP ${status}`);
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

export interface SseStreamOptions {
  url: string;
  /** A fresh bearer token for each connection. */
  token: () => Promise<string>;
  /** Statuses that end the stream with an SseStreamError instead of a retry. */
  finalStatuses?: readonly number[];
  /** Called on each connection accepted, reconnections included. */
  onOpen?: () => void;
  /** Called before each retry. */
  onRetry?: (delayMs: number, reason: unknown) => void;
}

/**
 * Server-sent events read with fetch: EventSource cannot send the bearer token.
 * Reconnects with exponential backoff until unsubscribed; never completes on its own.
 */
export function sseStream(options: SseStreamOptions): Observable<SseMessage> {
  return new Observable<SseMessage>(subscriber => {
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let delay = FIRST_RETRY_MS;

    const reconnect = (reason: unknown) => {
      if (controller.signal.aborted) {
        return;
      }
      options.onRetry?.(delay, reason);
      retryTimer = setTimeout(() => void connect(), delay);
      delay = Math.min(delay * 2, MAX_RETRY_MS);
    };

    const read = async (body: ReadableStream<Uint8Array>) => {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      const parser = new SseParser();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          return;
        }
        for (const message of parser.push(decoder.decode(value, { stream: true }))) {
          subscriber.next(message);
          // The subscriber may have left from inside next (take, takeWhile).
          if (controller.signal.aborted) {
            await reader.cancel();
            return;
          }
        }
      }
    };

    const connect = async () => {
      try {
        const token = await options.token();
        const response = await fetch(options.url, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal
        });
        if (options.finalStatuses?.includes(response.status)) {
          subscriber.error(new SseStreamError(response.status));
          return;
        }
        if (!response.ok || !response.body) {
          reconnect(`HTTP ${response.status}`);
          return;
        }
        delay = FIRST_RETRY_MS;
        options.onOpen?.();
        await read(response.body);
        reconnect('stream ended');
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
