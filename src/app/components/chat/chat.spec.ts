import 'zone.js';
import 'zone.js/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatComponent } from './chat';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { ChatService } from '../../services/chat.service';
import { UserService } from '../../services/user.service';
import { NavigationService } from '../../services/navigation.service';
import { of, BehaviorSubject, Subject, throwError } from 'rxjs';
import { Conversation, MessageType } from '../../models/chat.model';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

// The RSocket modules are replaced by the shared stub in src/testing. The factory re-exports
// the module rather than redefining an object, so the service and the test work on the same
// state — a Vite alias created two separate module instances instead.
vi.mock('rsocket-core', () => import('../../../testing/rsocket-core.stub'));
vi.mock('rsocket-websocket-client', () => import('../../../testing/rsocket-websocket-client.stub'));

describe('ChatComponent', () => {
    let component: ChatComponent;
    let fixture: ComponentFixture<ChatComponent>;
    let chatServiceMock: any;
    let userServiceMock: any;
    let navigationServiceMock: any;
    let routerMock: any;
    let paramMapSubject: BehaviorSubject<any>;
    let chatMessagesSubject: Subject<any>;

    const mockUser = { id: 'me', userName: 'Me' };
    const mockConv: Conversation = {
        id: 'conv1',
        participantIds: ['me', 'friend'],
        type: 'PRIVATE' as any,
        updatedAt: new Date().toISOString(),
        messages: [],
        bucketIndex: 1
    };

    beforeEach(async () => {
        paramMapSubject = new BehaviorSubject(convertToParamMap({ convId: 'conv1' }));
        chatMessagesSubject = new Subject();

        chatServiceMock = {
            getConversationById: vi.fn().mockReturnValue(of(mockConv)),
            getMessages: vi.fn().mockReturnValue(of({ messages: [], bucketIndex: 0 })),
            sendMessage: vi.fn(),
            messages$: chatMessagesSubject.asObservable(),
            initializeStream: vi.fn()
        };

        userServiceMock = {
            getCurrentUserValue: vi.fn().mockReturnValue(mockUser)
        };

        navigationServiceMock = {
            back: vi.fn()
        };

        routerMock = {
            navigate: vi.fn(),
            createUrlTree: vi.fn().mockReturnValue({}),
            serializeUrl: vi.fn().mockReturnValue('')
        };

        await TestBed.configureTestingModule({
            imports: [ChatComponent, NoopAnimationsModule],
            providers: [
                { provide: ChatService, useValue: chatServiceMock },
                { provide: UserService, useValue: userServiceMock },
                { provide: NavigationService, useValue: navigationServiceMock },
                { provide: Router, useValue: routerMock },
                {
                    provide: ActivatedRoute,
                    useValue: { paramMap: paramMapSubject.asObservable() }
                }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(ChatComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should load conversation on init', () => {
        expect(chatServiceMock.getConversationById).toHaveBeenCalledWith('conv1');
        expect(component.conversation()?.id).toBe('conv1');
        expect(component.isLoading()).toBe(false);
    });

    it('should derive the friend id from the participants', () => {
        // Loading by conversation id gives no friend id, and sending needs one. Asserted through
        // the send call rather than by reading a private field: what matters is that the message
        // is addressed to the other participant.
        chatServiceMock.sendMessage.mockReturnValue(of({
            id: '1', content: 'hi', senderId: 'me', senderName: 'Me', receiverId: 'friend',
            conversationId: 'conv1', timestamp: new Date().toISOString(),
            type: MessageType.TEXT, pending: false
        }));

        component.onSendMessage('hi');

        expect(chatServiceMock.sendMessage).toHaveBeenCalledWith('conv1', 'hi', 'friend');
    });

    it('should derive a missing title from the first message the other side sent', () => {
        chatServiceMock.getConversationById.mockReturnValue(of({
            ...mockConv,
            title: undefined,
            messages: [{
                id: '1', content: 'hey', senderId: 'friend', senderName: 'Friend',
                receiverId: 'me', conversationId: 'conv1',
                timestamp: new Date().toISOString(), type: MessageType.TEXT, reactions: {}
            }]
        }));

        component.loadConversationById('conv1');

        expect(component.conversationTitle()).toBe('Friend');
    });

    it('should report an error when the conversation cannot be loaded', () => {
        chatServiceMock.getConversationById.mockReturnValue(throwError(() => new Error('gone')));

        component.loadConversationById('conv1');

        expect(component.error()).toBe('Discussion introuvable');
        expect(component.isLoading()).toBe(false);
    });

    it('should report a missing conversation id from the route', () => {
        paramMapSubject.next(convertToParamMap({}));

        expect(component.error()).toBe('Discussion non spécifiée');
        expect(component.isLoading()).toBe(false);
    });

    it('should offer more history only when an older bucket exists', () => {
        expect(component.hasMoreHistory()).toBe(true);

        chatServiceMock.getConversationById.mockReturnValue(of({ ...mockConv, bucketIndex: 0 }));
        component.loadConversationById('conv1');

        expect(component.hasMoreHistory()).toBe(false);
    });

    it('should prepend older messages and stop offering history at bucket zero', () => {
        vi.useFakeTimers();
        chatServiceMock.getMessages.mockReturnValue(of({
            bucketIndex: 0,
            messages: [{
                id: 'old', content: 'older', senderId: 'friend', senderName: 'Friend',
                receiverId: 'me', conversationId: 'conv1',
                timestamp: new Date(Date.now() - 10000).toISOString(),
                type: MessageType.TEXT, reactions: {}
            }]
        }));

        component.onLoadMoreMessages();
        vi.advanceTimersByTime(100);

        expect(chatServiceMock.getMessages).toHaveBeenCalledWith('conv1', 0);
        expect(component.chatMessages()[0].text).toBe('older');
        expect(component.hasMoreHistory()).toBe(false);
        expect(component.isHistoryLoading()).toBe(false);
        vi.useRealTimers();
    });

    it('should not load history twice at once', () => {
        chatServiceMock.getMessages.mockReturnValue(new Subject());
        component.onLoadMoreMessages();
        expect(chatServiceMock.getMessages).toHaveBeenCalledTimes(1);

        component.onLoadMoreMessages();

        expect(chatServiceMock.getMessages).toHaveBeenCalledTimes(1);
    });

    it('should handle incoming messages from stream', async () => {
        const streamMsg = {
            id: '99',
            content: 'hello from stream',
            senderId: 'friend',
            senderName: 'Friend',
            conversationId: 'conv1',
            timestamp: new Date().toISOString(),
            type: MessageType.TEXT
        };

        chatMessagesSubject.next(streamMsg);
        fixture.detectChanges();
        await fixture.whenStable();

        expect(component.chatMessages().some(m => m.text === 'hello from stream')).toBe(true);
    });

    it('should send message and update UI', () => {
        const outMsg = {
            id: '100',
            content: 'test message',
            senderId: 'me',
            senderName: 'Me',
            receiverId: 'friend',
            conversationId: 'conv1',
            timestamp: new Date().toISOString(),
            type: MessageType.TEXT
        };
        chatServiceMock.sendMessage.mockReturnValue(of({ ...outMsg, pending: false }));

        component.onSendMessage('test message');

        expect(chatServiceMock.sendMessage).toHaveBeenCalledWith('conv1', 'test message', 'friend');
        expect(component.chatMessages().some(m => m.text === 'test message' && m.isMe)).toBe(true);
    });

    it('should call navigation service on goBack', () => {
        component.goBack();
        expect(navigationServiceMock.back).toHaveBeenCalled();
    });

    it('should load more messages when requested', () => {
        component.onLoadMoreMessages();
        expect(chatServiceMock.getMessages).toHaveBeenCalledWith('conv1', 0);
    });
});
