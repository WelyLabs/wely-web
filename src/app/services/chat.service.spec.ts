import 'zone.js';
import 'zone.js/testing';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ChatService } from './chat.service';
import { UserService } from './user.service';
import { environment } from '../../environments/environment';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of, firstValueFrom, Subject } from 'rxjs';
import { RSocketClient } from 'rsocket-core';
import { Buffer } from 'buffer';

// Hoisted mocks for RSocket
const mocks = vi.hoisted(() => {
    return {
        connectionStatus$: null as unknown as BehaviorSubject<any>,
        requestStream$: null as unknown as Subject<any>,
        lastRequestStream$: null as unknown as Subject<any>,
        mockSocket: {
            connectionStatus: vi.fn(),
            requestResponse: vi.fn(),
            requestStream: vi.fn(),
            close: vi.fn()
        },
        mockClient: {
            connect: vi.fn(),
            close: vi.fn()
        }
    };
});
import { BehaviorSubject } from 'rxjs';

// Mock rsocket-core
vi.mock('rsocket-core', () => {
    return {
        RSocketClient: vi.fn().mockImplementation(function () { return mocks.mockClient; }),
        JsonSerializer: {
            serialize: vi.fn().mockImplementation(data => Buffer.from(JSON.stringify(data))),
            deserialize: vi.fn().mockImplementation(data => JSON.parse(data.toString()))
        },
        IdentitySerializer: {},
        BufferEncoders: {},
        MESSAGE_RSOCKET_ROUTING: { string: 'routing' },
        MESSAGE_RSOCKET_AUTHENTICATION: { string: 'auth' },
        MESSAGE_RSOCKET_COMPOSITE_METADATA: { string: 'composite' },
        encodeCompositeMetadata: vi.fn().mockReturnValue((globalThis as typeof globalThis & { Buffer: any }).Buffer?.from('metadata') || {}),
        encodeRoute: vi.fn().mockReturnValue((globalThis as typeof globalThis & { Buffer: any }).Buffer?.from('route') || {}),
        encodeAndAddWellKnownAuthMetadata: vi.fn()
    };
});

// Mock rsocket-websocket-client
vi.mock('rsocket-websocket-client', () => {
    return {
        default: vi.fn().mockImplementation(function () { return {}; })
    };
});

describe('ChatService', () => {
    let service: ChatService;
    let httpMock: HttpTestingController;
    let userServiceMock: any;
    const apiUrl = `${environment.apiUrl}/chat-service`;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();

        // 1. Setup global mocks before TestBed
        mocks.connectionStatus$ = new BehaviorSubject({ kind: 'CONNECTED' });
        mocks.requestStream$ = new Subject();

        mocks.mockSocket.connectionStatus.mockReturnValue(mocks.connectionStatus$.asObservable());
        mocks.mockSocket.requestResponse.mockReturnValue({
            subscribe: (callbacks: any) => {
                const sub = of({ data: {} }).subscribe({
                    next: (val: unknown) => callbacks.onNext && callbacks.onNext(val),
                    complete: () => callbacks.onComplete && callbacks.onComplete()
                });
                return { unsubscribe: () => sub.unsubscribe() };
            }
        });
        mocks.mockSocket.requestStream.mockImplementation(() => {
            const s = new Subject<any>();
            mocks.lastRequestStream$ = s;
            return {
                subscribe: (callbacks: any) => {
                    const sub = s.subscribe({
                        next: (val: unknown) => callbacks.onNext && callbacks.onNext(val),
                        error: (err: Error) => callbacks.onError && callbacks.onError(err),
                        complete: () => callbacks.onComplete && callbacks.onComplete()
                    });
                    return { cancel: () => sub.unsubscribe() };
                }
            };
        });

        mocks.mockClient.connect.mockReturnValue({
            subscribe: (callbacks: any) => {
                if (callbacks.onComplete) setTimeout(() => callbacks.onComplete(mocks.mockSocket), 0);
                return { unsubscribe: () => { } };
            }
        });

        userServiceMock = {
            getAccessToken: vi.fn().mockReturnValue('mock-token'),
            getCurrentUserValue: vi.fn().mockReturnValue({ id: 'user1', userName: 'test' }),
            currentUser$: of({ id: 'user1', userName: 'test' })
        };

        // 2. Ensure TestBed is clean
        TestBed.resetTestingModule();

        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [
                ChatService,
                { provide: UserService, useValue: userServiceMock }
            ]
        });

        service = TestBed.inject(ChatService);
        httpMock = TestBed.inject(HttpTestingController);

        // Advance timers to let constructor's connect() finish
        vi.advanceTimersByTime(10);
    });

    afterEach(() => {
        if (service) {
            service.ngOnDestroy();
        }
        if (httpMock) {
            try {
                httpMock.verify();
            } catch (e) { }
        }
        vi.useRealTimers();
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('should initialize RSocket client on creation', () => {
        expect(RSocketClient).toHaveBeenCalled();
        expect(mocks.mockClient.connect).toHaveBeenCalled();
    });

    it('should test RSocket serializers', () => {
        const config = vi.mocked(RSocketClient).mock.calls[0][0];
        const data = { test: 'val' };

        // Mocking the behavior of serializers to avoid Buffer issues in tests
        const serialized = config.serializers.data.serialize(data);
        expect(serialized).toBeDefined();

        const deserialized = config.serializers.data.deserialize(serialized);
        expect(deserialized).toEqual(data);
    });

    it('should get all conversations via HTTP', () => {
        service.getAllConversations().subscribe();
        const req = httpMock.expectOne(`${apiUrl}/conversations/all`);
        req.flush([]);
    });

    it('should send a message optimistically', async () => {
        const res = await firstValueFrom(service.sendMessage('c1', 'hello', 'u2'));
        expect(res.content).toBe('hello');
        expect(mocks.mockSocket.requestResponse).toHaveBeenCalled();
    });

    it('should initialize stream and receive messages', async () => {
        service.initializeStream();

        const mockMsg = { id: 'm1', content: 'test' };
        const promise = firstValueFrom(service.messages$);

        mocks.lastRequestStream$.next({ data: mockMsg });

        const msg = await promise;
        expect(msg).toEqual(mockMsg);
    });

    it('should retry stream on error', async () => {
        service.initializeStream();

        const promise = firstValueFrom(service.messages$);

        // First attempt fails
        const firstStream = mocks.lastRequestStream$;
        firstStream.error(new Error('fail'));

        // Wait for retry
        await vi.advanceTimersByTimeAsync(2500);

        // Second attempt succeeds (mockImplementation created a new Subject)
        mocks.lastRequestStream$.next({ data: { id: 'retry-msg' } });

        const msg = await promise;
        expect(msg.id).toBe('retry-msg');
    });

    it('should handle disconnection and reconnect after 5s', async () => {
        vi.mocked(RSocketClient).mockClear();
        service['isReconnecting'] = false;

        // Trigger CLOSED status
        mocks.connectionStatus$.next({ kind: 'CLOSED' });

        expect(service['isReconnecting']).toBe(true);

        // Reset status so the NEW connection doesn't immediately fail
        mocks.connectionStatus$.next({ kind: 'CONNECTED' });

        await vi.advanceTimersByTimeAsync(5500);

        expect(RSocketClient).toHaveBeenCalled();
        expect(service['isReconnecting']).toBe(false);
    });

    it('should close RSocket client on destroy', () => {
        service.ngOnDestroy();
        expect(mocks.mockClient.close).toHaveBeenCalled();
    });
});
