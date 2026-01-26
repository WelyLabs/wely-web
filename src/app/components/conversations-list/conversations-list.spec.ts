import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConversationsListComponent } from './conversations-list';
import { ChatService } from '../../services/chat.service';
import { UserService } from '../../services/user.service';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ConversationSummary, ConversationType } from '../../models/chat.model';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('ConversationsListComponent', () => {
    let component: ConversationsListComponent;
    let fixture: ComponentFixture<ConversationsListComponent>;
    let chatServiceMock: any;
    let userServiceMock: any;
    let routerMock: any;

    const mockConversations: ConversationSummary[] = [
        {
            id: '1',
            title: 'Dave',
            type: ConversationType.PRIVATE,
            updatedAt: new Date().toISOString(),
            lastBucketIndex: 0
        }
    ];

    beforeEach(async () => {
        chatServiceMock = {
            getAllConversations: vi.fn().mockReturnValue(of(mockConversations))
        };
        userServiceMock = {
            getCurrentUserValue: vi.fn().mockReturnValue({ id: 'me' })
        };
        routerMock = {
            navigate: vi.fn()
        };

        await TestBed.configureTestingModule({
            imports: [ConversationsListComponent, NoopAnimationsModule],
            providers: [
                { provide: ChatService, useValue: chatServiceMock },
                { provide: UserService, useValue: userServiceMock },
                { provide: Router, useValue: routerMock }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(ConversationsListComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should load conversations on init', () => {
        expect(chatServiceMock.getAllConversations).toHaveBeenCalled();
        expect(component.conversations.length).toBe(1);
        expect(component.isLoading).toBe(false);
    });

    it('should handle error during loading', () => {
        chatServiceMock.getAllConversations.mockReturnValue(throwError(() => new Error('Error')));
        component.loadConversations();
        expect(component.error).toBeDefined();
        expect(component.isLoading).toBe(false);
    });

    it('should navigate to chat when openConversation is called', () => {
        const summary = mockConversations[0];
        component.openConversation(summary);
        expect(routerMock.navigate).toHaveBeenCalledWith(['/chat', summary.id]);
    });

    it('should return correct last message content', () => {
        const summaryWithMsg = {
            ...mockConversations[0],
            lastMessage: { content: 'hello', senderId: 'friend' }
        };
        expect(component.getLastMessageContent(summaryWithMsg as any)).toBe('hello');

        const summaryWithMyMsg = {
            ...mockConversations[0],
            lastMessage: { content: 'hi', senderId: 'me' }
        };
        expect(component.getLastMessageContent(summaryWithMyMsg as any)).toBe('Vous: hi');
    });

    it('should return correct initial', () => {
        expect(component.getAvatarInitial('Dave')).toBe('D');
        expect(component.getAvatarInitial('')).toBe('?');
    });
});
