import { CallService } from '../../services/call.service';
import { callServiceStub } from '../../../testing/call-service.stub';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatComponent, presenceLabel } from './chat';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { ChatService } from '../../services/chat.service';
import { UserService } from '../../services/user.service';
import { NavigationService } from '../../services/navigation.service';
import { SocialService } from '../../services/social.service';
import { AvatarService } from '../../services/avatar.service';
import { signal } from '@angular/core';
import { of, BehaviorSubject, Subject, throwError } from 'rxjs';
import { Conversation, ConversationType, MessageType } from '../../models/chat.model';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { ChatPhotoService } from '../../services/chat-photo.service';
import { MEDIA_PAGE_SIZE } from './chat';
import { PhotoResizer } from '../../core/ui/photo-resize';
import { PhotoViewerData } from '../photo-viewer/photo-viewer';
import { HttpErrorResponse } from '@angular/common/http';

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
    let socialServiceMock: { listFriendships: ReturnType<typeof vi.fn> };
    let chatPhotosMock: { send: ReturnType<typeof vi.fn>; page: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
    let dialogMock: { open: ReturnType<typeof vi.fn> };
    let callServiceMock: ReturnType<typeof callServiceStub>;

    const mockUser = { id: 'me', userName: 'Me' };
    const mockConv: Conversation = {
        id: 'conv1',
        participantIds: ['me', 'friend'],
        type: ConversationType.DIRECT,
        updatedAt: new Date().toISOString(),
        messages: [],
        bucketIndex: 1
    };

    beforeEach(async () => {
        callServiceMock = callServiceStub();
        paramMapSubject = new BehaviorSubject(convertToParamMap({ convId: 'conv1' }));
        chatMessagesSubject = new Subject();

        chatServiceMock = {
            getConversationById: vi.fn().mockReturnValue(of(mockConv)),
            getPresence: vi.fn().mockReturnValue(of({ userId: 'friend', online: true, lastSeenAt: null })),
            getMessages: vi.fn().mockReturnValue(of({ messages: [], bucketIndex: 0 })),
            sendMessage: vi.fn(),
            messages$: chatMessagesSubject.asObservable(),
            initializeStream: vi.fn()
        };

        userServiceMock = {
            getCurrentUserValue: vi.fn().mockReturnValue(mockUser)
        };

        socialServiceMock = { listFriendships: vi.fn().mockReturnValue(of([])) };
        chatPhotosMock = { send: vi.fn(), page: vi.fn().mockReturnValue(of([])), remove: vi.fn() };
        dialogMock = { open: vi.fn().mockReturnValue({ afterClosed: () => of(undefined) }) };
        vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:local'), revokeObjectURL: vi.fn() }));

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
                { provide: CallService, useValue: callServiceMock },
                { provide: UserService, useValue: userServiceMock },
                { provide: NavigationService, useValue: navigationServiceMock },
                { provide: SocialService, useValue: socialServiceMock },
                { provide: ChatPhotoService, useValue: chatPhotosMock },
                { provide: MatDialog, useValue: dialogMock },
                // The canvas work is the browser's: here a photo is "scaled down" to a small JPEG at once.
                { provide: PhotoResizer, useValue: { downscale: vi.fn().mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' })) } },
                // The friend has a picture; nobody else does.
                { provide: AvatarService, useValue: { url: (id: string | null) => signal(id === 'friend' ? '/pics/friend.jpg' : null) } },
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

    it('openPartner_shouldOpenThePartnersPage_fromTheHeader', () => {
        fixture.detectChanges();

        (fixture.nativeElement.querySelector('.user-info') as HTMLButtonElement).click();

        expect(routerMock.navigate).toHaveBeenCalledWith(['/friends', 'friend']);
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

    it('conversationTitle_shouldNameThePartnerFromTheFriendList_beforeTheyWrite', () => {
        // With no message from the partner yet, the title used to stay on « Chargement... ».
        socialServiceMock.listFriendships.mockReturnValue(of([{ userId: 'friend', userName: 'lea', hashtag: 6000 }]));
        component.ngOnInit();

        component.loadConversationById('conv1');

        expect(component.conversationTitle()).toBe('lea');
    });

    it('conversationTitle_shouldSayConversation_whenNothingNamesThePartner', () => {
        component.loadConversationById('conv1');

        expect(component.conversationTitle()).toBe('Conversation');
    });

    it('conversationTitle_shouldStillName_whenTheFriendListCannotBeRead', () => {
        socialServiceMock.listFriendships.mockReturnValue(throwError(() => new Error('down')));
        component.ngOnInit();

        component.loadConversationById('conv1');

        expect(component.conversationTitle()).toBe('Conversation');
    });

    it('template_shouldShowThePartnersPictureInTheHeader', () => {
        component.loadConversationById('conv1');
        fixture.detectChanges();

        expect(component.partnerPicture()).toBe('/pics/friend.jpg');
        expect(fixture.nativeElement.querySelector('.avatar-sm img')?.getAttribute('src')).toBe('/pics/friend.jpg');
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

    it('stream_shouldShowADateFixedNotice_asASystemLine', () => {
        chatMessagesSubject.next({
            id: 'sys1', content: '📅 Date fixée : jeudi 15 octobre, 19:00 – 21:00', senderId: 'system', senderName: 'Wely',
            conversationId: 'conv1', timestamp: new Date().toISOString(), type: MessageType.SYSTEM, kind: 'NEW', photo: null
        });
        fixture.detectChanges();

        const notice = component.chatMessages().find(m => m.id === 'sys1');
        expect(notice?.system).toBe(true);
        expect(notice?.isMe).toBe(false);
        expect(fixture.nativeElement.querySelector('.system-notice')?.textContent).toContain('Date fixée');
    });

    it('toChatMessage_shouldTreatAMessageWithoutTypeAsText', () => {
        chatMessagesSubject.next({
            id: 'old', content: 'avant', senderId: 'friend', senderName: 'Friend', conversationId: 'conv1',
            timestamp: new Date().toISOString()
        });

        expect(component.chatMessages().find(m => m.id === 'old')?.system).toBeUndefined();
    });

    it('stream_shouldNotShowTheSameMessageTwice', () => {
        const streamMsg = {
            id: '99', content: 'once', senderId: 'friend', senderName: 'Friend', conversationId: 'conv1',
            timestamp: new Date().toISOString(), type: MessageType.TEXT, kind: 'NEW'
        };

        chatMessagesSubject.next(streamMsg);
        chatMessagesSubject.next(streamMsg);

        expect(component.chatMessages().filter(m => m.id === '99')).toHaveLength(1);
        expect(component.messages().filter(m => m.id === '99')).toHaveLength(1);
    });

    it('stream_shouldIgnoreTheViewersOwnNewMessages_andOtherConversations', () => {
        const base = { content: 'x', senderName: 'Me', timestamp: new Date().toISOString(), type: MessageType.TEXT };

        chatMessagesSubject.next({ ...base, id: 'a', senderId: 'me', conversationId: 'conv1' });
        chatMessagesSubject.next({ ...base, id: 'b', senderId: 'friend', conversationId: 'other' });

        expect(component.chatMessages()).toEqual([]);
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

    describe('event group', () => {
        const group: Conversation = {
            id: 'conv-ev', participantIds: ['me', 'ines', 'hugo'], type: ConversationType.EVENT,
            title: 'Soirée jeux de société', eventId: 'ev-1', updatedAt: '', messages: [], bucketIndex: 0
        };

        const settle = async () => {
            await new Promise(resolve => setTimeout(resolve));
            fixture.detectChanges();
        };

        /** Lets the private conversation's first presence read go out, then switches to the group. */
        async function openGroup(): Promise<void> {
            await settle();
            chatServiceMock.getConversationById.mockReturnValue(of(group));
            chatServiceMock.getPresence.mockClear();
            paramMapSubject.next(convertToParamMap({ convId: 'conv-ev' }));
            await settle();
        }

        it('template_shouldNameTheGroupAfterTheEventAndCountItsMembers', async () => {
            await openGroup();

            expect(component.isEventGroup()).toBe(true);
            const header = fixture.nativeElement.querySelector('.chat-header') as HTMLElement;
            expect(header.textContent).toContain('Soirée jeux de société');
            expect(header.textContent).toContain('3 membres');
            expect(header.querySelector('.event-link')).not.toBeNull();
        });

        it('partnerPresence_shouldNotBeAskedForAGroup', async () => {
            await openGroup();

            expect(chatServiceMock.getPresence).not.toHaveBeenCalled();
        });

        it('onSendMessage_shouldSendToTheGroupWithoutAPartner', async () => {
            await openGroup();
            chatServiceMock.sendMessage.mockReturnValue(of({
                id: '1', content: 'hi', senderId: 'me', senderName: 'Me', receiverId: '',
                conversationId: 'conv-ev', timestamp: new Date().toISOString(), type: MessageType.TEXT, pending: false
            }));

            component.onSendMessage('hi');

            expect(chatServiceMock.sendMessage).toHaveBeenCalledWith('conv-ev', 'hi', '');
        });

        it('openPartner_shouldDoNothingForAGroup', async () => {
            await openGroup();

            const header = fixture.nativeElement.querySelector('.user-info') as HTMLButtonElement;
            expect(header.disabled).toBe(true);
            component.openPartner();
            expect(routerMock.navigate).not.toHaveBeenCalledWith(['/friends', expect.anything()]);
        });

        it('openEvent_shouldOpenTheGroupsEvent', async () => {
            await openGroup();

            component.openEvent();

            expect(routerMock.navigate).toHaveBeenCalledWith(['/event', 'ev-1']);
        });
    });

    describe('presence', () => {
        // The first read is on timer(0, …): a macrotask after the conversation loads.
        const settle = async (target = fixture) => {
            await new Promise(resolve => setTimeout(resolve));
            target.detectChanges();
        };

        beforeEach(() => settle());

        it('partnerPresence_shouldReadTheOtherParticipant', () => {
            expect(chatServiceMock.getPresence).toHaveBeenCalledWith('friend');
            expect(component.presenceText()).toBe('En ligne');
            expect(component.isPartnerOnline()).toBe(true);
        });

        it('template_shouldShowTheStatus', () => {
            fixture.detectChanges();
            const status = fixture.nativeElement.querySelector('.status-text') as HTMLElement;

            expect(status.textContent?.trim()).toBe('En ligne');
            expect(status.classList).not.toContain('offline');
        });

        it('partnerPresence_shouldShowNothing_whenItCannotBeRead', async () => {
            chatServiceMock.getPresence.mockReturnValue(throwError(() => new Error('404')));
            const other = TestBed.createComponent(ChatComponent);
            other.detectChanges();
            await settle(other);

            expect(other.componentInstance.presenceText()).toBeNull();
            expect(other.nativeElement.querySelector('.status-text')).toBeNull();
        });
    });

    describe('presenceLabel', () => {
        const now = new Date(2026, 9, 11, 18, 0);
        const seen = (date: Date) => ({ userId: 'friend', online: false, lastSeenAt: date.toISOString() });

        it('presenceLabel_shouldSayOnline', () => {
            expect(presenceLabel({ userId: 'friend', online: true, lastSeenAt: null }, now)).toBe('En ligne');
        });

        it('presenceLabel_shouldGiveTheTime_forToday', () => {
            expect(presenceLabel(seen(new Date(2026, 9, 11, 14, 32)), now)).toBe('Vu à 14:32');
        });

        it('presenceLabel_shouldSayYesterday', () => {
            expect(presenceLabel(seen(new Date(2026, 9, 10, 9, 5)), now)).toBe('Vu hier à 09:05');
        });

        it('presenceLabel_shouldGiveTheDate_beforeThat', () => {
            expect(presenceLabel(seen(new Date(2026, 9, 3, 9, 5)), now)).toBe('Vu le 3 oct.');
        });

        it('presenceLabel_shouldSayNothing_forSomeoneNeverSeenOrUnknown', () => {
            expect(presenceLabel({ userId: 'friend', online: false, lastSeenAt: null }, now)).toBeNull();
            expect(presenceLabel(null, now)).toBeNull();
        });
    });

    describe('photos', () => {
        const stored = {
            id: 'p1', senderId: 'me', senderName: 'Me', receiverId: '', conversationId: 'conv1', content: '',
            type: MessageType.TEXT, timestamp: '2026-10-13T20:00:00Z', reactions: {},
            photo: { width: 1600, height: 1200, url: 'https://media/p1.jpg', removed: false }
        };
        const eventGroup = (organizerId: string | null): Conversation => ({
            ...mockConv, type: ConversationType.EVENT, participantIds: ['olivia', 'me', 'friend'], organizerId
        });

        it('canRemovePhotoOf_shouldBeTheSender_orTheEventOrganizer', () => {
            component.loadConversationById('conv1');
            expect(component.canRemovePhotoOf('me')).toBe(true);
            expect(component.canRemovePhotoOf('friend')).toBe(false);

            chatServiceMock.getConversationById.mockReturnValue(of({ ...eventGroup('me') }));
            component.loadConversationById('conv1');
            expect(component.canRemovePhotoOf('friend')).toBe(true);
        });

        it('moderatorId_shouldFallBackOnTheFirstMember_forOlderGroups', () => {
            chatServiceMock.getConversationById.mockReturnValue(of(eventGroup(null)));
            component.loadConversationById('conv1');

            expect(component.moderatorId()).toBe('olivia');
        });

        it('onSendPhoto_shouldShowItAtOnce_thenSwapInWhatTheServerStored', async () => {
            component.loadConversationById('conv1');
            chatPhotosMock.send.mockReturnValue(of(stored));

            await component.onSendPhoto(new File(['raw'], 'IMG_1.HEIC'));

            expect(chatPhotosMock.send).toHaveBeenCalledWith('conv1', expect.any(Blob));
            const last = component.chatMessages().at(-1)!;
            expect(last.id).toBe('p1');
            expect(last.isMe).toBe(true);
            expect(last.photo?.url).toBe('https://media/p1.jpg');
        });

        it('onSendPhoto_shouldMarkThePhotoNotSent_whenTheUploadFails', async () => {
            component.loadConversationById('conv1');
            chatPhotosMock.send.mockReturnValue(throwError(() => new Error('502')));

            await component.onSendPhoto(new File(['raw'], 'a.jpg'));

            const last = component.chatMessages().at(-1)!;
            expect(last.failed).toBe(true);
            expect(last.photo?.url).toBe('blob:local');
        });

        it('openPhotoFromThread_shouldOpenTheViewer_andShowARemovalEverywhere', () => {
            chatServiceMock.getConversationById.mockReturnValue(of({ ...mockConv, messages: [stored] }));
            component.loadConversationById('conv1');
            dialogMock.open.mockReturnValue({ afterClosed: () => of('removed') });

            component.openPhotoFromThread(component.chatMessages()[0]);

            const data = dialogMock.open.mock.calls[0][1].data as PhotoViewerData;
            expect(data).toMatchObject({ url: 'https://media/p1.jpg', title: 'Toi', canRemove: true });
            expect(component.chatMessages()[0].photo?.removed).toBe(true);
        });

        it('openPhotoFromThread_shouldRemoveThroughTheChat_andExplainARefusal', () => {
            chatServiceMock.getConversationById.mockReturnValue(of({ ...mockConv, messages: [stored] }));
            component.loadConversationById('conv1');
            chatPhotosMock.remove.mockReturnValue(of(undefined));

            component.openPhotoFromThread(component.chatMessages()[0]);

            const data = dialogMock.open.mock.calls[0][1].data as PhotoViewerData;
            data.remove?.().subscribe();
            expect(chatPhotosMock.remove).toHaveBeenCalledWith('conv1', 'p1');
            expect(data.removeError?.(new HttpErrorResponse({ status: 403, error: { code: 'CHT-BUS-007' } })))
                .toContain('Seul l’auteur de la photo');
            expect(data.removeError?.(new Error('502'))).toBeNull();
        });

        it('openPhotoFromThread_shouldIgnoreAPhotoStillSending', () => {
            component.openPhotoFromThread({ id: 'local', text: '', time: '', isMe: true, pending: true,
                photo: { url: 'blob:x', width: 1, height: 1, removed: false } });

            expect(dialogMock.open).not.toHaveBeenCalled();
        });

        it('toggleMedia_shouldLoadThePhotos_thenPageFromTheOldest', () => {
            component.loadConversationById('conv1');
            const page = Array.from({ length: MEDIA_PAGE_SIZE }, (_, i) => ({
                conversationId: 'conv1', messageId: `m${i}`, senderId: 'friend',
                photo: { width: 1, height: 1, url: `u${i}`, removed: false }, sentAt: `2026-10-13T20:${String(59 - i).padStart(2, '0')}:00Z`
            }));
            chatPhotosMock.page.mockReturnValue(of(page));

            component.toggleMedia();
            expect(chatPhotosMock.page).toHaveBeenCalledWith('conv1', undefined);
            expect(component.mediaHasMore()).toBe(true);

            component.loadMedia();
            expect(chatPhotosMock.page).toHaveBeenLastCalledWith('conv1', page.at(-1)!.sentAt);
        });

        it('template_shouldShowAPlaceholderTile_forAPhotoWithoutUrl', () => {
            component.loadConversationById('conv1');
            chatPhotosMock.page.mockReturnValue(of([{ conversationId: 'conv1', messageId: 'm1', senderId: 'friend',
                photo: { width: 1, height: 1, url: null, removed: false }, sentAt: '2026-10-13T20:00:00Z' }]));

            component.toggleMedia();
            fixture.detectChanges();

            const tile = fixture.nativeElement.querySelector('.media-tile.unavailable') as HTMLElement;
            expect(tile.textContent).toContain('Photo indisponible');
            expect(fixture.nativeElement.querySelector('.media-tile img')).toBeNull();
        });

        it('openPhotoFromMedia_shouldIgnoreAPhotoWithoutUrl', () => {
            component.loadConversationById('conv1');

            component.openPhotoFromMedia({ conversationId: 'conv1', messageId: 'm1', senderId: 'friend',
                photo: { width: 1, height: 1, url: null, removed: false }, sentAt: '2026-10-13T20:00:00Z' });

            expect(dialogMock.open).not.toHaveBeenCalled();
        });

        it('stream_shouldReplaceAnUpdatedMessage_dropItFromTheMediaTab_andCloseItsViewer', () => {
            const fromFriend = { ...stored, senderId: 'friend', senderName: 'Friend' };
            chatServiceMock.getConversationById.mockReturnValue(of({ ...mockConv, messages: [fromFriend] }));
            component.loadConversationById('conv1');
            chatPhotosMock.page.mockReturnValue(of([{ conversationId: 'conv1', messageId: 'p1', senderId: 'friend',
                photo: fromFriend.photo, sentAt: fromFriend.timestamp }]));
            component.toggleMedia();
            const close = vi.fn();
            dialogMock.open.mockReturnValue({ afterClosed: () => new Subject(), close });
            component.openPhotoFromMedia(component.mediaPhotos()[0]);

            chatMessagesSubject.next({ ...fromFriend, kind: 'UPDATED',
                photo: { key: null, width: 0, height: 0, url: null, removed: true } });

            expect(component.chatMessages()).toHaveLength(1);
            expect(component.chatMessages()[0].photo?.removed).toBe(true);
            expect(component.messages()[0].photo?.removed).toBe(true);
            expect(component.mediaPhotos()).toEqual([]);
            expect(close).toHaveBeenCalled();
        });

        it('stream_shouldUpdateTheViewersOwnPhoto_removedByTheOrganizer', () => {
            chatServiceMock.getConversationById.mockReturnValue(of({ ...mockConv, messages: [stored] }));
            component.loadConversationById('conv1');

            chatMessagesSubject.next({ ...stored, kind: 'UPDATED', photo: { width: 0, height: 0, url: null, removed: true } });

            expect(component.chatMessages()[0].photo?.removed).toBe(true);
            expect(component.chatMessages()[0].isMe).toBe(true);
        });

        it('stream_shouldIgnoreAnUpdateToAMessageNotLoaded', () => {
            component.loadConversationById('conv1');

            chatMessagesSubject.next({ ...stored, id: 'older', kind: 'UPDATED', photo: { width: 0, height: 0, url: null, removed: true } });

            expect(component.chatMessages()).toEqual([]);
        });

        it('stream_shouldLeaveTheViewerOpen_forAnotherPhotosUpdate', () => {
            chatServiceMock.getConversationById.mockReturnValue(of({ ...mockConv, messages: [stored, { ...stored, id: 'p2' }] }));
            component.loadConversationById('conv1');
            const close = vi.fn();
            dialogMock.open.mockReturnValue({ afterClosed: () => new Subject(), close });
            component.openPhotoFromThread(component.chatMessages()[0]);

            chatMessagesSubject.next({ ...stored, id: 'p2', kind: 'UPDATED', photo: { width: 0, height: 0, url: null, removed: true } });

            expect(close).not.toHaveBeenCalled();
        });

        it('toggleMedia_shouldSayWhenThePhotosCannotBeRead', () => {
            component.loadConversationById('conv1');
            chatPhotosMock.page.mockReturnValue(throwError(() => new Error('down')));

            component.toggleMedia();
            fixture.detectChanges();

            expect(component.mediaState()).toBe('unavailable');
            expect(fixture.nativeElement.textContent).toContain('Les photos ne sont pas disponibles');
        });
    });
    describe('calls', () => {
        const call = (status: 'ACTIVE' | 'ENDED') => ({
            id: 'call-1', conversationId: 'conv1', startedBy: 'friend', media: 'AUDIO' as const, status,
            startedAt: '2026-10-15T18:00:00Z', endedAt: null, memberIds: ['user1', 'friend'], participants: [],
        });

        it('startCall_shouldCallTheConversation_thenOpenTheCall', async () => {
            callServiceMock.start.mockResolvedValue(call('ACTIVE'));

            await component.startCall('VIDEO');

            expect(callServiceMock.start).toHaveBeenCalledWith('conv1', 'VIDEO');
            expect(routerMock.navigate).toHaveBeenCalledWith(['/call', 'call-1']);
        });

        it('startCall_shouldStayHere_whenTheCallCouldNotStart', async () => {
            await component.startCall('AUDIO');

            expect(routerMock.navigate).not.toHaveBeenCalledWith(['/call', expect.anything()]);
            expect(component.callStarting()).toBe(false);
        });

        it('template_shouldOfferToJoin_whileACallGoesOnHere', () => {
            callServiceMock.events$.next({ type: 'RINGING', actorId: 'friend', call: call('ACTIVE') });
            fixture.detectChanges();
            expect(fixture.nativeElement.querySelector('.join-call')).not.toBeNull();

            callServiceMock.events$.next({ type: 'ENDED', actorId: 'friend', call: call('ENDED') });
            fixture.detectChanges();
            expect(fixture.nativeElement.querySelector('.join-call')).toBeNull();
            expect(fixture.nativeElement.querySelectorAll('.call-button').length).toBe(2);
        });

        it('followLiveCall_shouldAskOnce_whichCallGoesOnInTheConversation', () => {
            expect(callServiceMock.liveCall).toHaveBeenCalledWith('conv1');
        });
    });
});
