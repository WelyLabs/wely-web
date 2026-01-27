import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ChatService } from './chat.service';
import { UserService } from './user.service';
import { environment } from '../../environments/environment';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of, firstValueFrom, Subject } from 'rxjs';
import { RSocketClient } from 'rsocket-core';
import { Buffer } from 'buffer';

const mocks = vi.hoisted(() => {
    const mockSocket = {
        connectionStatus: vi.fn().mockReturnValue({
            subscribe: (c: any) => {
                if (typeof c === 'function') c({ kind: 'CONNECTED' });
                else if (c.onNext) c.onNext({ kind: 'CONNECTED' });
                return { unsubscribe: () => { } };
            }
        }),
        requestResponse: vi.fn().mockReturnValue({
            subscribe: (c: any) => {
                if (c.onNext) c.onNext({});
                if (c.onComplete) c.onComplete();
                return { unsubscribe: () => { } };
            }
        }),
        requestStream: vi.fn().mockReturnValue({
            subscribe: (c: any) => {
                return { cancel: () => { } };
            }
        }),
        close: vi.fn()
    };
    const mockClient = {
        connect: vi.fn().mockReturnValue({
            subscribe: (callbacks: any) => {
                if (callbacks.onComplete) callbacks.onComplete(mockSocket);
                return { unsubscribe: () => { } };
            }
        }),
        close: vi.fn()
    };

    const RSocketClientMock = vi.fn().mockImplementation(function () { return mockClient; });
    const RSocketWebSocketClientMock = vi.fn().mockImplementation(function () { return {}; });

    return {
        mockSocket,
        mockClient,
        RSocketClient: RSocketClientMock,
        RSocketWebSocketClient: RSocketWebSocketClientMock
    };
});

// Manual mock of rsocket-core
vi.mock('rsocket-core', () => {
    return {
        RSocketClient: mocks.RSocketClient,
        JsonSerializer: {},
        IdentitySerializer: {},
        BufferEncoders: {},
        MESSAGE_RSOCKET_ROUTING: { string: 'routing' },
        MESSAGE_RSOCKET_AUTHENTICATION: { string: 'auth' },
        MESSAGE_RSOCKET_COMPOSITE_METADATA: { string: 'composite' },
        encodeCompositeMetadata: vi.fn(),
        encodeRoute: vi.fn(),
        encodeAndAddWellKnownAuthMetadata: vi.fn()
    };
});

vi.mock('rsocket-websocket-client', () => {
    return { default: mocks.RSocketWebSocketClient };
});

describe('ChatService', () => {
    let service: ChatService;
    let httpMock: HttpTestingController;
    let userServiceMock: any;
    const apiUrl = `${environment.apiUrl}/chat-service`;

    beforeEach(() => {
        userServiceMock = {
            getAccessToken: vi.fn().mockReturnValue('mock-token'),
            getCurrentUserValue: vi.fn().mockReturnValue({ id: 'user1', userName: 'test' }),
            currentUser$: of({ id: 'user1', userName: 'test' })
        };

        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [
                ChatService,
                { provide: UserService, useValue: userServiceMock }
            ]
        });
        service = TestBed.inject(ChatService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        if (httpMock) httpMock.verify();
        vi.restoreAllMocks();
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('should test RSocket serializers', () => {
        const config = (vi.mocked(RSocketClient) as any).mock.calls[0][0];
        const data = { test: 'val' };
        const serialized = config.serializers.data.serialize(data);
        expect(serialized).toBeInstanceOf(Buffer);
        const deserialized = config.serializers.data.deserialize(serialized);
        expect(deserialized).toEqual(data);
    });

    it('should get conversation by friendId', () => {
        const mockConv: any = { id: 'conv1' };
        service.getConversation('f1').subscribe(conv => expect(conv).toEqual(mockConv));
        const req = httpMock.expectOne(req => req.url.includes('/conversations'));
        req.flush(mockConv);
    });

    it('should get all conversations', () => {
        service.getAllConversations().subscribe();
        httpMock.expectOne(`${apiUrl}/conversations/all`).flush([]);
    });

    it('should get conversation by ID', () => {
        service.getConversationById('c1').subscribe();
        httpMock.expectOne(`${apiUrl}/conversations/c1`).flush({});
    });

    it('should get a bucket of messages', () => {
        service.getMessages('c1', 0).subscribe();
        httpMock.expectOne(req => req.url.includes('/loadMessages')).flush({});
    });

    it('should send a message optimistically', async () => {
        const res = await firstValueFrom(service.sendMessage('c1', 'hi', 'u2'));
        expect(res.content).toBe('hi');
    });

    it('should error on sendMessage if user not authenticated', async () => {
        userServiceMock.getCurrentUserValue.mockReturnValue(null);
        try {
            await firstValueFrom(service.sendMessage('c1', 'h', 'r'));
        } catch (e) {
            expect(e).toBeDefined();
        }
    });

    it('should handle sendMessage onComplete', async () => {
        const consoleSpy = vi.spyOn(console, 'log');
        const mockSocket = {
            requestResponse: () => ({
                subscribe: (c: any) => { if (c.onComplete) c.onComplete(); }
            })
        };
        service['socketSubject'].next(mockSocket);
        await firstValueFrom(service.sendMessage('c1', 'h', 'r'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('acquittée'));
    });

    it('should handle sendMessage onError', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const mockSocket = {
            requestResponse: () => ({
                subscribe: (c: any) => { if (c.onError) c.onError('Error'); }
            })
        };
        service['socketSubject'].next(mockSocket);
        try {
            await firstValueFrom(service.sendMessage('c1', 'h', 'r'));
        } catch (e) {
            // Error is expected
        }
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Erreur envoi'), expect.anything());
    });

    it('should initialize stream and receive messages', async () => {
        const mockMsg = { id: 'm1', content: 'test' };
        service['socketSubject'].next({
            requestStream: () => ({
                subscribe: (c: any) => {
                    setTimeout(() => c.onNext({ data: mockMsg }), 0);
                    return { cancel: () => { } };
                }
            })
        });
        service.initializeStream();
        const msg = await firstValueFrom(service.messages$);
        expect(msg).toEqual(mockMsg);
    });

    it('should handle stream error and retry', async () => {
        vi.useFakeTimers();
        let calls = 0;
        service['socketSubject'].next({
            requestStream: () => ({
                subscribe: (c: any) => {
                    calls++;
                    if (calls === 1) c.onError('Fail');
                    else c.onNext({ data: { id: 'm-retry' } });
                    return { cancel: () => { } };
                }
            })
        });
        service.initializeStream();
        const promise = firstValueFrom(service.messages$);
        await vi.advanceTimersByTimeAsync(2500);
        const msg = await promise;
        expect(msg.id).toBe('m-retry');
        vi.useRealTimers();
    });

    it('should request messages on stream subscribe', () => {
        const mockSub = { request: vi.fn() };
        service['socketSubject'].next({
            requestStream: () => ({
                subscribe: (c: any) => {
                    c.onSubscribe(mockSub);
                    return { cancel: () => { } };
                }
            })
        });
        service.initializeStream();
        expect(mockSub.request).toHaveBeenCalled();
    });

    it('should close client on destroy', () => {
        const spy = vi.spyOn(service['client'], 'close');
        service.ngOnDestroy();
        expect(spy).toHaveBeenCalled();
    });

    it('should handle reconnection on handleDisconnect', () => {
        vi.useFakeTimers();
        const spy = vi.spyOn(service as any, 'connect');
        service['handleDisconnect']();
        vi.advanceTimersByTime(6000);
        expect(spy).toHaveBeenCalled();
        vi.useRealTimers();
    });
});
