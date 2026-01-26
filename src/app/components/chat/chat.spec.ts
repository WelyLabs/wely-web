import 'zone.js';
import 'zone.js/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatComponent } from './chat';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { ChatService } from '../../services/chat.service';
import { UserService } from '../../services/user.service';
import { NavigationService } from '../../services/navigation.service';
import { of, BehaviorSubject, Subject } from 'rxjs';
import { Conversation, Message, MessageType } from '../../models/chat.model';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

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
        expect(component.conversation).toEqual(mockConv);
        expect(component.friendId).toBe('friend');
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

        expect(component.chatMessages.some(m => m.text === 'hello from stream')).toBe(true);
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
        chatServiceMock.sendMessage.mockReturnValue(of(outMsg));

        component.onSendMessage('test message');

        expect(chatServiceMock.sendMessage).toHaveBeenCalledWith('conv1', 'test message', 'friend');
        expect(component.chatMessages.some(m => m.text === 'test message' && m.isMe)).toBe(true);
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
