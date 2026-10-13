import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConversationsListComponent } from './conversations-list';
import { ChatService } from '../../services/chat.service';
import { AvatarService } from '../../services/avatar.service';
import { signal } from '@angular/core';
import { UserService } from '../../services/user.service';
import { SocialService } from '../../services/social.service';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ConversationSummary, ConversationType } from '../../models/chat.model';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

// The RSocket modules are replaced by the shared stub in src/testing. The factory re-exports
// the module rather than redefining an object, so the service and the test work on the same
// state — a Vite alias created two separate module instances instead.
vi.mock('rsocket-core', () => import('../../../testing/rsocket-core.stub'));
vi.mock('rsocket-websocket-client', () => import('../../../testing/rsocket-websocket-client.stub'));

describe('ConversationsListComponent', () => {
    let component: ConversationsListComponent;
    let fixture: ComponentFixture<ConversationsListComponent>;
    let chatServiceMock: any;
    let userServiceMock: any;
    let routerMock: any;
    let socialServiceMock: { listFriendships: ReturnType<typeof vi.fn> };

    const mockConversations: ConversationSummary[] = [
        {
            id: '1',
            title: 'Dave',
            type: ConversationType.DIRECT,
            updatedAt: new Date().toISOString(),
            lastBucketIndex: 0
        }
    ];

    beforeEach(async () => {
        chatServiceMock = {
            getAllConversations: vi.fn().mockReturnValue(of(mockConversations)),
            getPresence: vi.fn().mockReturnValue(of({ userId: 'x', online: false, lastSeenAt: null }))
        };
        socialServiceMock = { listFriendships: vi.fn().mockReturnValue(of([])) };
        userServiceMock = {
            getCurrentUserValue: vi.fn().mockReturnValue({ id: 'me' })
        };
        // A real router: the template's routerLinks need one, and navigate is spied on instead.
        await TestBed.configureTestingModule({
            imports: [ConversationsListComponent, NoopAnimationsModule],
            providers: [
                provideRouter([]),
                { provide: ChatService, useValue: chatServiceMock },
                { provide: UserService, useValue: userServiceMock },
                { provide: SocialService, useValue: socialServiceMock },
                // Pictures come from AvatarService by user id; lea has one.
                { provide: AvatarService, useValue: { url: (id: string | null) => signal(id === 'lea' ? '/demo/avatars/lea.svg' : null) } }
            ]
        }).compileComponents();
        routerMock = TestBed.inject(Router);
        vi.spyOn(routerMock, 'navigate').mockResolvedValue(true);

        fixture = TestBed.createComponent(ConversationsListComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should load conversations on init', () => {
        expect(chatServiceMock.getAllConversations).toHaveBeenCalled();
        expect(component.conversations().length).toBe(1);
        expect(component.isLoading()).toBe(false);
    });

    it('should sort conversations with the most recently updated first', () => {
        const older = { ...mockConversations[0], id: 'older', updatedAt: '2025-01-01T10:00:00Z' };
        const newer = { ...mockConversations[0], id: 'newer', updatedAt: '2025-06-01T10:00:00Z' };
        chatServiceMock.getAllConversations.mockReturnValue(of([older, newer]));

        component.loadConversations();

        expect(component.conversations().map(conversation => conversation.id))
            .toEqual(['newer', 'older']);
    });

    it('should not sort the array it was handed', () => {
        // The previous version called .sort() on the service's own array, which mutates it in
        // place: a caller holding that reference would silently see it reordered.
        const source = [
            { ...mockConversations[0], id: 'older', updatedAt: '2025-01-01T10:00:00Z' },
            { ...mockConversations[0], id: 'newer', updatedAt: '2025-06-01T10:00:00Z' }
        ];
        chatServiceMock.getAllConversations.mockReturnValue(of(source));

        component.loadConversations();

        expect(source.map(conversation => conversation.id)).toEqual(['older', 'newer']);
    });

    it('should handle error during loading', () => {
        chatServiceMock.getAllConversations.mockReturnValue(throwError(() => new Error('Error')));

        component.loadConversations();

        expect(component.error()).toBe('Impossible de charger vos conversations');
        expect(component.isLoading()).toBe(false);
    });

    it('should clear a previous error when reloading', () => {
        chatServiceMock.getAllConversations.mockReturnValue(throwError(() => new Error('Error')));
        component.loadConversations();
        expect(component.error()).not.toBeNull();

        chatServiceMock.getAllConversations.mockReturnValue(of(mockConversations));
        component.loadConversations();

        expect(component.error()).toBeNull();
    });

    it('should navigate to chat when openConversation is called', () => {
        const summary = mockConversations[0];
        component.openConversation(summary);
        expect(routerMock.navigate).toHaveBeenCalledWith(['/chat', summary.id]);
    });

    it('openConversation_shouldOpenAnEventGroupInTheChatToo', () => {
        component.openConversation({ ...mockConversations[0], id: 'conv-ev', type: ConversationType.EVENT, eventId: 'ev-1' });

        expect(routerMock.navigate).toHaveBeenCalledWith(['/chat', 'conv-ev']);
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

    it('template_shouldOpenTheFriendsFromTheNewConversationButton', () => {
        // Without RouterLink in the component's imports, the routerLink attribute was inert and
        // the click went nowhere.
        const navigate = vi.spyOn(routerMock, 'navigateByUrl').mockResolvedValue(true);

        (fixture.nativeElement.querySelector('.new-conv-btn') as HTMLButtonElement).click();

        expect(navigate).toHaveBeenCalled();
        expect(String(navigate.mock.calls[0][0])).toBe('/friends');
    });

    describe('rows', () => {
        const withLea = (overrides: Partial<ConversationSummary> = {}): ConversationSummary => ({
            id: 'c-lea', participantIds: ['me', 'lea'], type: ConversationType.DIRECT,
            title: '', updatedAt: new Date().toISOString(), lastBucketIndex: 0, ...overrides
        });
        const lea = { userId: 'lea', userName: 'lea', hashtag: 6000, profilePicUrl: '/demo/avatars/lea.svg',
            closeness: 'INTIMATE' as const, proposal: null, proposedByFriend: false };

        const load = (conversations: ConversationSummary[]) => {
            chatServiceMock.getAllConversations.mockReturnValue(of(conversations));
            component.loadConversations();
            fixture.detectChanges();
        };

        it('rows_shouldNameAConversationAfterThePartner_fromTheFriendList', () => {
            socialServiceMock.listFriendships.mockReturnValue(of([lea]));
            component.ngOnInit();

            load([withLea()]);

            expect(component.rows()[0]).toMatchObject({ name: 'lea', avatarUrl: '/demo/avatars/lea.svg' });
            expect(fixture.nativeElement.querySelector('.conv-item .name').textContent).toContain('lea');
            expect(fixture.nativeElement.querySelector('.avatar-gradient img')).not.toBeNull();
        });

        it('rows_shouldFallBackToThePartnersLastMessage', () => {
            load([withLea({ lastMessage: { senderId: 'lea', senderName: 'Léa', content: 'hi' } as never })]);

            expect(component.rows()[0].name).toBe('Léa');
        });

        it('rows_shouldSayConversation_whenNothingNamesThePartner', () => {
            load([withLea()]);

            expect(component.rows()[0].name).toBe('Conversation');
            // The picture comes by user id from AvatarService, friend or not.
            expect(component.rows()[0].avatarUrl).toBe('/demo/avatars/lea.svg');
        });

        it('rows_shouldShowNoPicture_forAPartnerWithoutOne', () => {
            load([withLea({ id: 'c-bob', participantIds: ['me', 'bob'] })]);

            expect(component.rows()[0].avatarUrl).toBeNull();
        });

        it('loadPresence_shouldShowTheDotOnlyForAPartnerOnline', () => {
            chatServiceMock.getPresence.mockImplementation((id: string) => of({ userId: id, online: id === 'lea', lastSeenAt: null }));

            // Fixed dates: the list sorts by them, and two "now"s a millisecond apart flipped the order.
            load([
                withLea({ updatedAt: '2026-10-11T18:00:00Z' }),
                withLea({ id: 'c-bob', participantIds: ['me', 'bob'], updatedAt: '2026-10-11T17:00:00Z' })
            ]);

            expect(chatServiceMock.getPresence).toHaveBeenCalledWith('lea');
            expect(chatServiceMock.getPresence).toHaveBeenCalledWith('bob');
            expect(component.rows().map(row => [row.conversation.id, row.online])).toEqual([['c-lea', true], ['c-bob', false]]);
            expect(fixture.nativeElement.querySelectorAll('.status-indicator.online').length).toBe(1);
        });

        it('loadPresence_shouldShowNoDot_whenPresenceCannotBeRead', () => {
            chatServiceMock.getPresence.mockReturnValue(throwError(() => new Error('404')));

            load([withLea()]);

            expect(component.rows()[0].online).toBe(false);
        });

        it('rows_shouldNameAnEventGroupAfterItsTitle_andAskNoPresence', () => {
            load([withLea({ type: ConversationType.EVENT, title: 'Soirée jeux', eventId: 'ev-1', participantIds: ['me', 'lea', 'bob'] })]);

            expect(component.rows()[0].name).toBe('Soirée jeux');
            expect(chatServiceMock.getPresence).not.toHaveBeenCalled();
        });
    });
});

