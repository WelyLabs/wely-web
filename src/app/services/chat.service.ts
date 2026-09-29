import { Injectable, OnDestroy, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, timer, throwError } from 'rxjs';
import { filter, retry, switchMap, take, takeUntil } from 'rxjs/operators';
import {
  BufferEncoders,
  MESSAGE_RSOCKET_AUTHENTICATION,
  MESSAGE_RSOCKET_COMPOSITE_METADATA,
  MESSAGE_RSOCKET_ROUTING,
  Payload,
  ReactiveSocket,
  RSocketClient,
  encodeCompositeMetadata,
  encodeRoute,
} from 'rsocket-core';
import RSocketWebSocketClient from 'rsocket-websocket-client';
import { Buffer } from 'buffer';
import { environment } from '../../environments/environment';
import {
  Conversation,
  ConversationSummary,
  Message,
  MessageBucket,
  MessageType,
} from '../models/chat.model';
import { UserService } from './user.service';
import { LoggerService } from '../core/logging/logger.service';

/** What the server expects on `chat.send`; the sender is taken from the token. */
interface ChatInput {
  receiverId: string;
  conversationId: string;
  content: string;
}

/** A message whose delivery has not been confirmed by the server yet. */
export interface PendingMessage extends Message {
  pending: boolean;
  failed?: boolean;
}

type ChatSocket = ReactiveSocket<unknown, Buffer>;

const SCOPE = 'ChatService';

/** RSocket metadata prefix for a bearer token, per the well-known auth encoding. */
const BEARER_AUTH_TYPE = 0x81;

@Injectable({ providedIn: 'root' })
export class ChatService implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly userService = inject(UserService);
  private readonly logger = inject(LoggerService);

  private readonly apiUrl = `${environment.apiUrl}/chat-service`;

  private client?: RSocketClient<unknown, Buffer>;
  private readonly socket$ = new BehaviorSubject<ChatSocket | null>(null);
  private readonly destroy$ = new Subject<void>();
  private readonly messages$$ = new Subject<Message>();

  /** Messages pushed by the server for the current user. */
  readonly messages$ = this.messages$$.asObservable();

  private reconnectAttempt = 0;
  private reconnecting = false;
  private streamStarted = false;

  // --- connection --------------------------------------------------------

  /**
   * Opens the connection on first use.
   *
   * <p>Not in the constructor: this service is root-provided, so a constructor
   * connection fires at bootstrap — for signed-out visitors on the landing page,
   * and in every test that happens to pull the service in, which made the suite
   * flaky through reconnect timers outliving a test file.
   */
  private ensureConnected(): void {
    if (this.client) {
      return;
    }

    this.logger.debug(SCOPE, 'opening RSocket connection');

    this.client = new RSocketClient<unknown, Buffer>({
      serializers: {
        data: {
          serialize: (data: unknown) => Buffer.from(JSON.stringify(data)),
          deserialize: (raw: unknown) => JSON.parse(String(raw)),
        },
        metadata: {
          serialize: (metadata: Buffer) => metadata,
          deserialize: (raw: unknown) => raw as Buffer,
        },
      },
      setup: {
        keepAlive: 30_000,
        lifetime: 90_000,
        dataMimeType: 'application/json',
        metadataMimeType: MESSAGE_RSOCKET_COMPOSITE_METADATA.string,
      },
      transport: new RSocketWebSocketClient({ url: environment.rsocketUrl }, BufferEncoders),
    });

    this.client.connect().subscribe({
      onComplete: (socket: ChatSocket) => {
        this.logger.debug(SCOPE, 'RSocket connected');
        this.reconnectAttempt = 0;
        this.socket$.next(socket);

        socket.connectionStatus().subscribe((status) => {
          if (status.kind === 'CLOSED' || status.kind === 'ERROR') {
            this.logger.warn(SCOPE, `connection ${status.kind}`);
            this.scheduleReconnect();
          }
        });
      },
      onError: (error: Error) => {
        this.logger.error(SCOPE, 'RSocket connection failed', error);
        this.scheduleReconnect();
      },
    });
  }

  /**
   * Reconnects with exponential backoff, capped.
   *
   * <p>The previous version retried on a flat 5s forever, which turns a server
   * outage into a steady stream of connection attempts from every open tab.
   */
  private scheduleReconnect(): void {
    if (this.reconnecting) {
      return;
    }
    this.reconnecting = true;
    this.socket$.next(null);
    this.client = undefined;

    const delay = Math.min(1_000 * 2 ** this.reconnectAttempt, 30_000);
    this.reconnectAttempt += 1;
    this.logger.debug(SCOPE, `reconnecting in ${delay}ms`);

    timer(delay)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.reconnecting = false;
        this.ensureConnected();
      });
  }

  private connectedSocket(): Observable<ChatSocket> {
    this.ensureConnected();
    return this.socket$.pipe(filter((socket): socket is ChatSocket => socket !== null));
  }

  private metadataFor(route: string): Buffer {
    const token = this.userService.getAccessToken();
    if (!token) {
      throw new Error('No access token available for the RSocket request');
    }

    const authMetadata = Buffer.concat([Buffer.from([BEARER_AUTH_TYPE]), Buffer.from(token)]);

    return encodeCompositeMetadata([
      [MESSAGE_RSOCKET_ROUTING, encodeRoute(route)],
      [MESSAGE_RSOCKET_AUTHENTICATION, authMetadata],
    ]);
  }

  // --- HTTP --------------------------------------------------------------

  /** Gets or creates the conversation with a given friend. */
  getConversation(friendId: string): Observable<Conversation> {
    const params = new HttpParams().set('friendId', friendId);
    return this.http.get<Conversation>(`${this.apiUrl}/conversations`, { params });
  }

  getAllConversations(): Observable<ConversationSummary[]> {
    return this.http.get<ConversationSummary[]>(`${this.apiUrl}/conversations/all`);
  }

  getConversationById(conversationId: string): Observable<Conversation> {
    return this.http.get<Conversation>(`${this.apiUrl}/conversations/${conversationId}`);
  }

  /** Reads one page of history, oldest pages having the lower bucket index. */
  getMessages(conversationId: string, bucketIndex: number): Observable<MessageBucket> {
    const params = new HttpParams().set('bucketIndex', bucketIndex.toString());
    return this.http.get<MessageBucket>(
      `${this.apiUrl}/conversations/${conversationId}/loadMessages`,
      { params },
    );
  }

  // --- RSocket -----------------------------------------------------------

  /**
   * Sends a message, emitting it immediately as pending and then again once the
   * server acknowledges — or marked failed if it does not.
   *
   * <p>The previous version emitted the optimistic copy and completed the stream
   * straight away. Completing first makes any later `error` a no-op in RxJS, so a
   * message that never reached the server still showed as sent, with nothing
   * anywhere to say otherwise.
   */
  sendMessage(
    conversationId: string,
    content: string,
    receiverId: string,
  ): Observable<PendingMessage> {
    const currentUser = this.userService.getCurrentUserValue();
    if (!currentUser) {
      return throwError(() => new Error('Cannot send a message while signed out'));
    }

    const optimistic: PendingMessage = {
      // Local correlation id; replaced by the server's once acknowledged.
      id: `pending-${crypto.randomUUID()}`,
      senderId: currentUser.id,
      senderName: currentUser.userName,
      receiverId,
      conversationId,
      content,
      type: MessageType.TEXT,
      timestamp: new Date().toISOString(),
      reactions: {},
      pending: true,
    };

    return this.connectedSocket().pipe(
      take(1),
      switchMap(
        (socket) =>
          new Observable<PendingMessage>((observer) => {
            observer.next(optimistic);

            const input: ChatInput = { receiverId, conversationId, content };
            const payload: Payload<unknown, Buffer> = {
              data: input,
              metadata: this.metadataFor('chat.send'),
            };

            socket.requestResponse(payload).subscribe({
              onComplete: (response) => {
                const confirmed = (response?.data ?? null) as Message | null;
                observer.next({
                  ...optimistic,
                  ...(confirmed ?? {}),
                  pending: false,
                });
                observer.complete();
              },
              onError: (error: Error) => {
                this.logger.error(SCOPE, 'message delivery failed', error);
                observer.next({ ...optimistic, pending: false, failed: true });
                observer.error(error);
              },
            });
          }),
      ),
    );
  }

  /**
   * Opens the single server-push stream for the current user.
   *
   * <p>One stream for the whole app rather than one per conversation: components
   * filter {@link messages$} by the conversation they display.
   */
  initializeStream(): void {
    if (this.streamStarted) {
      return;
    }
    this.streamStarted = true;

    this.connectedSocket()
      .pipe(
        switchMap(
          (socket) =>
            new Observable<Message>((observer) => {
              const payload: Payload<unknown, Buffer> = {
                data: null,
                metadata: this.metadataFor('chat.stream'),
              };

              socket.requestStream(payload).subscribe({
                onSubscribe: (subscription) => {
                  // Bounded demand, renewed as messages arrive, rather than
                  // Integer.MAX_VALUE — which asks the server for everything at
                  // once and gives up the backpressure RSocket exists to provide.
                  subscription.request(STREAM_DEMAND);
                  this.pendingDemand = STREAM_DEMAND;
                  this.subscription = subscription;
                },
                onNext: (frame) => {
                  const message = frame.data as Message | null;
                  if (message) {
                    observer.next(message);
                  }
                  this.replenishDemand();
                },
                onComplete: () => observer.complete(),
                onError: (error: Error) => observer.error(error),
              });

              return () => this.subscription?.cancel();
            }),
        ),
        retry({
          delay: (error, attempt) => {
            const wait = Math.min(1_000 * 2 ** (attempt - 1), 30_000);
            this.logger.warn(SCOPE, `stream failed, retrying in ${wait}ms`, error);
            return timer(wait);
          },
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (message) => this.messages$$.next(message),
        error: (error) => this.logger.error(SCOPE, 'message stream gave up', error),
      });
  }

  private subscription?: { request(n: number): void; cancel(): void };
  private pendingDemand = 0;

  private replenishDemand(): void {
    this.pendingDemand -= 1;
    if (this.pendingDemand <= STREAM_DEMAND / 2) {
      this.subscription?.request(STREAM_DEMAND);
      this.pendingDemand += STREAM_DEMAND;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.client?.close();
  }
}

/** Messages requested at a time; demand is renewed as they are consumed. */
const STREAM_DEMAND = 64;
