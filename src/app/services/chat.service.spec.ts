import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ChatService } from './chat.service';
import { UserService } from './user.service';
import { environment } from '../../environments/environment';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of } from 'rxjs';

// Manual mock of rsocket-core to avoid hoisting and initialization issues
vi.mock('rsocket-core', () => {
    return {
        RSocketClient: vi.fn().mockImplementation(function () {
            return {
                connect: vi.fn().mockReturnValue({
                    subscribe: (callbacks: any) => {
                        if (typeof callbacks === 'function') {
                            setTimeout(() => callbacks({
                                connectionStatus: () => ({
                                    subscribe: (statusCb: any) => {
                                        statusCb({ kind: 'CONNECTED' });
                                        return { unsubscribe: () => { } };
                                    }
                                }),
                                requestResponse: () => ({ subscribe: () => { } }),
                                requestStream: () => ({ subscribe: () => { } }),
                                close: () => { }
                            }), 0);
                        } else if (callbacks && callbacks.onComplete) {
                            setTimeout(() => callbacks.onComplete({
                                connectionStatus: () => ({
                                    subscribe: (statusCb: any) => {
                                        statusCb({ kind: 'CONNECTED' });
                                        return { unsubscribe: () => { } };
                                    }
                                }),
                                requestResponse: () => ({ subscribe: () => { } }),
                                requestStream: () => ({ subscribe: () => { } }),
                                close: () => { }
                            }), 0);
                        }
                        return { unsubscribe: () => { } };
                    }
                }),
                close: vi.fn() // Essential for ngOnDestroy
            };
        }),
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

// Mock rsocket-websocket-client using a regular function to allow 'new'
vi.mock('rsocket-websocket-client', () => {
    return {
        default: vi.fn().mockImplementation(function () {
            return {};
        })
    };
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
        if (httpMock) {
            httpMock.verify();
        }
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('should get conversation by friendId', () => {
        const mockConv: any = { id: 'conv1' };
        const friendId = 'friend1';
        service.getConversation(friendId).subscribe((conv: any) => {
            expect(conv).toEqual(mockConv);
        });

        const req = httpMock.expectOne((req: any) => req.url === `${apiUrl}/conversations` && req.params.get('friendId') === friendId);
        req.flush(mockConv);
    });

    it('should get all conversations', () => {
        service.getAllConversations().subscribe();
        const req = httpMock.expectOne(`${apiUrl}/conversations/all`);
        req.flush([]);
    });

    it('should get conversation by ID', () => {
        const convId = 'conv1';
        service.getConversationById(convId).subscribe();
        const req = httpMock.expectOne(`${apiUrl}/conversations/${convId}`);
        req.flush({});
    });

    it('should send a message optimistically', () => {
        const convId = 'conv1';
        const content = 'Hello';
        const receiverId = 'user2';

        service.sendMessage(convId, content, receiverId).subscribe((msg: any) => {
            expect(msg.content).toBe(content);
            expect(msg.conversationId).toBe(convId);
            expect(msg.receiverId).toBe(receiverId);
        });
    });
});
