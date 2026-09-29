/**
 * Test stub for `rsocket-core`, aliased in place of the real module by vitest.config.ts.
 *
 * <p>Aliasing rather than `vi.mock` in each spec: four component specs import
 * ChatService only for its DI token, which still pulls the real WebSocket client into
 * the module graph. Whether the chat service spec then saw the mock or the real module
 * depended on file order, which made the suite flake. One alias removes the ordering
 * question entirely.
 */

import { Buffer } from 'buffer';

export interface StubSubscriber {
  onSubscribe?: (subscription: { request: (n: number) => void; cancel: () => void }) => void;
  onNext?: (value: unknown) => void;
  onComplete?: (value?: unknown) => void;
  onError?: (error: Error) => void;
}

/** Control surface a spec drives the stub through. */
export const rsocketStub = {
  /** Demand values the service requested, in order. */
  requestedDemand: [] as number[],
  /** Subscribers currently attached to the server-push stream. */
  streamSubscribers: [] as StubSubscriber[],
  /** Whether requestResponse acknowledges or rejects. */
  responseBehaviour: 'success' as 'success' | 'failure',
  /** Payload returned on a successful acknowledgement. */
  responsePayload: { data: { id: 'server-id-1' } } as unknown,
  /** Set when the client is constructed; null once closed. */
  connected: false,
  connectAttempts: 0,
  closeCalls: 0,
  /** Set to false to make connect() report a failure instead of succeeding. */
  connectSucceeds: true,

  reset(): void {
    this.requestedDemand = [];
    this.streamSubscribers = [];
    this.responseBehaviour = 'success';
    this.responsePayload = { data: { id: 'server-id-1' } };
    this.connected = false;
    this.connectAttempts = 0;
    this.closeCalls = 0;
    this.connectSucceeds = true;
  },

  /** Pushes a server message to every attached stream subscriber. */
  emit(value: unknown): void {
    this.streamSubscribers.forEach((subscriber) => subscriber.onNext?.({ data: value }));
  },
};

const socket = {
  requestResponse: () => ({
    subscribe: (subscriber: StubSubscriber) => {
      if (rsocketStub.responseBehaviour === 'failure') {
        subscriber.onError?.(new Error('delivery refused'));
      } else {
        subscriber.onComplete?.(rsocketStub.responsePayload);
      }
    },
  }),
  requestStream: () => ({
    subscribe: (subscriber: StubSubscriber) => {
      subscriber.onSubscribe?.({
        request: (n: number) => rsocketStub.requestedDemand.push(n),
        cancel: () => undefined,
      });
      rsocketStub.streamSubscribers.push(subscriber);
    },
  }),
  fireAndForget: () => undefined,
  connectionStatus: () => ({ subscribe: () => undefined }),
  close: () => undefined,
};

export class RSocketClient {
  connect() {
    rsocketStub.connectAttempts += 1;
    return {
      subscribe: (subscriber: StubSubscriber) => {
        if (rsocketStub.connectSucceeds) {
          rsocketStub.connected = true;
          subscriber.onComplete?.(socket);
        } else {
          subscriber.onError?.(new Error('connection refused'));
        }
      },
    };
  }

  close() {
    rsocketStub.closeCalls += 1;
    rsocketStub.connected = false;
  }
}

export const MESSAGE_RSOCKET_ROUTING = {
  string: 'message/x.rsocket.routing.v0',
  identifier: 0x7e,
};
export const MESSAGE_RSOCKET_AUTHENTICATION = {
  string: 'message/x.rsocket.authentication.v0',
  identifier: 0x7c,
};
export const MESSAGE_RSOCKET_COMPOSITE_METADATA = {
  string: 'message/x.rsocket.composite-metadata.v0',
  identifier: 0x7f,
};

export const IdentitySerializer = {
  serialize: (value: unknown) => value,
  deserialize: (raw: unknown) => raw,
};
export const JsonSerializer = IdentitySerializer;
export const BufferEncoders = {};

export const encodeRoute = (route: string) => Buffer.from(route);
export const encodeCompositeMetadata = () => Buffer.from('metadata');
export const encodeAndAddWellKnownAuthMetadata = () => Buffer.from('auth');
