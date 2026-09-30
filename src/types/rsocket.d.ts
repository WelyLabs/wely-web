/**
 * Minimal typings for the `rsocket-js` 0.0.x line, which ships none.
 *
 * These two modules were previously declared bare — `declare module 'rsocket-core';` —
 * which types the whole module as `any` and propagated through ChatService, the most
 * intricate service in the app. Only what the app actually uses is described here;
 * anything unused is deliberately absent rather than loosely typed.
 */

declare module 'rsocket-core' {
  /** A frame's payload: data and routing/authentication metadata. */
  export interface Payload<D = unknown, M = unknown> {
    data: D | null;
    metadata?: M;
  }

  /** Reactive-Streams style subscriber used by RSocket's own single/stream results. */
  export interface RSocketSubscriber<T> {
    onSubscribe?(subscription: RSocketSubscription): void;
    onNext?(value: T): void;
    onComplete?(value?: T): void;
    onError?(error: Error): void;
  }

  export interface RSocketSubscription {
    request(n: number): void;
    cancel(): void;
  }

  export interface RSocketSingle<T> {
    subscribe(subscriber: RSocketSubscriber<T>): void;
  }

  export interface ConnectionStatus {
    kind: 'NOT_CONNECTED' | 'CONNECTING' | 'CONNECTED' | 'CLOSED' | 'ERROR';
    error?: Error;
  }

  /** A live RSocket connection. */
  export interface ReactiveSocket<D = unknown, M = unknown> {
    requestResponse(payload: Payload<D, M>): RSocketSingle<Payload<D, M>>;
    requestStream(payload: Payload<D, M>): RSocketSingle<Payload<D, M>>;
    fireAndForget(payload: Payload<D, M>): void;
    connectionStatus(): { subscribe(onNext: (status: ConnectionStatus) => void): void };
    close(): void;
  }

  export interface Serializer<T> {
    serialize(value: T): unknown;
    deserialize(raw: unknown): T;
  }

  export interface SerializersConfig<D, M> {
    data: Serializer<D>;
    metadata: Serializer<M>;
  }

  export interface SetupConfig {
    keepAlive: number;
    lifetime: number;
    dataMimeType: string;
    metadataMimeType: string;
  }

  export interface RSocketClientOptions<D, M> {
    serializers: SerializersConfig<D, M>;
    setup: SetupConfig;
    transport: unknown;
  }

  export class RSocketClient<D = unknown, M = unknown> {
    constructor(options: RSocketClientOptions<D, M>);
    connect(): RSocketSingle<ReactiveSocket<D, M>>;
    close(): void;
  }

  /** A well-known MIME type, exposed both as a byte and as its string form. */
  export interface WellKnownMimeType {
    readonly string: string;
    readonly identifier: number;
  }

  export const MESSAGE_RSOCKET_ROUTING: WellKnownMimeType;
  export const MESSAGE_RSOCKET_COMPOSITE_METADATA: WellKnownMimeType;
  export const MESSAGE_RSOCKET_AUTHENTICATION: WellKnownMimeType;

  export const IdentitySerializer: Serializer<unknown>;
  export const JsonSerializer: Serializer<unknown>;

  export function encodeRoute(route: string): Buffer;
  export function encodeCompositeMetadata(
    entries: [WellKnownMimeType | string, Buffer][],
  ): Buffer;
  export function encodeAndAddWellKnownAuthMetadata(
    buffer: Buffer,
    type: WellKnownMimeType,
    payload: Buffer,
  ): Buffer;

  export const BufferEncoders: unknown;
}

declare module 'rsocket-websocket-client' {
  export interface WebsocketClientOptions {
    url: string;
    wsCreator?: (url: string) => WebSocket;
    debug?: boolean;
  }

  export default class RSocketWebSocketClient {
    constructor(options: WebsocketClientOptions, encoders?: unknown);
  }
}
