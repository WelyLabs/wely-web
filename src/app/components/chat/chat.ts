import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, timer } from 'rxjs';
import { LoggerService } from '../../core/logging/logger.service';

import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { UserService } from '../../services/user.service';
import { ChatService, PendingMessage, upsertById } from '../../services/chat.service';
import { NavigationService } from '../../services/navigation.service';
import { Conversation, ConversationPhoto, ConversationType, Message, MessagePhoto, Presence, isSystemMessage } from '../../models/chat.model';
import { SharedChatComponent, ChatMessage } from '../shared/chat/shared-chat';
import { SocialService } from '../../services/social.service';
import { AvatarService } from '../../services/avatar.service';
import { FriendSummary } from '../../models/friendship.model';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { ChatPhotoService } from '../../services/chat-photo.service';
import { PhotoResizer } from '../../core/ui/photo-resize';
import { PhotoViewerComponent, PhotoViewerData, PhotoViewerResult } from '../photo-viewer/photo-viewer';
import { PendingTrailDirective } from '../../core/ui/pending-trail.directive';

/** How many photos the media tab reads at a time; a shorter page means there are no more. */
export const MEDIA_PAGE_SIZE = 30;

/** How often the other participant's presence is re-read: wely-chat refreshes it every 30 s. */
const PRESENCE_POLL_MS = 30_000;

/**
 * "En ligne", or when the person was last seen, in French: "Vu à 14:32" today, "Vu hier à 09:10",
 * "Vu le 3 oct." before. Null when there is nothing to say.
 */
export function presenceLabel(presence: Presence | null, now: Date = new Date()): string | null {
    if (!presence) {
        return null;
    }
    if (presence.online) {
        return 'En ligne';
    }
    if (!presence.lastSeenAt) {
        return null;
    }
    const seen = new Date(presence.lastSeenAt);
    const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(seen);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (seen.toDateString() === now.toDateString()) {
        return `Vu à ${time}`;
    }
    if (seen.toDateString() === yesterday.toDateString()) {
        return `Vu hier à ${time}`;
    }
    return `Vu le ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(seen)}`;
}

/** How long the browser is given to settle before a whole batch of history is prepended. */
const HISTORY_PREPEND_DELAY_MS = 50;

/**
 * One conversation: its history, the live stream, and sending. Either private, with someone, or an
 * event's group, named after the event and linked to it.
 */
@Component({
    selector: 'app-chat',
    standalone: true,
    imports: [MatButtonModule, MatIconModule, SharedChatComponent, PendingTrailDirective],
    templateUrl: './chat.html',
    styleUrl: './chat.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponent implements OnInit {
    private readonly logger = inject(LoggerService);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly chatService = inject(ChatService);
    private readonly userService = inject(UserService);
    private readonly navigationService = inject(NavigationService);
    private readonly socialService = inject(SocialService);
    private readonly avatars = inject(AvatarService);
    private readonly chatPhotos = inject(ChatPhotoService);
    private readonly photoResizer = inject(PhotoResizer);
    private readonly dialog = inject(MatDialog);
    private readonly destroyRef = inject(DestroyRef);

    readonly conversation = signal<Conversation | null>(null);
    readonly messages = signal<Message[]>([]);
    readonly isLoading = signal(true);
    readonly isSending = signal(false);
    readonly error = signal<string | null>(null);
    readonly isHistoryLoading = signal(false);
    readonly hasMoreHistory = signal(false);
    readonly convId = signal<string | null>(null);

    readonly placeholder = 'Écrivez votre message...';

    private friendId: string | null = null;
    private currentUserId: string | null = null;

    /**
     * The view model the chat panel renders.
     *
     * <p>Derived rather than maintained in parallel: `messages` and `chatMessages` used to be
     * written side by side in four places, and the send path wrote only one of them — so an
     * acknowledged message updated the display without updating the history it was derived from.
     */
    readonly chatMessages = signal<ChatMessage[]>([]);

    /** The user's friends, by id: where a private conversation's name comes from. */
    private readonly friends = signal<ReadonlyMap<string, FriendSummary>>(new Map());

    /**
     * An event's group is named after the event. A private conversation has no title: it is named
     * after the partner, from the friend list, else from a message they sent. It used to wait for
     * such a message, and read « Chargement... » for good when the partner had not written yet.
     */
    readonly conversationTitle = computed(() => {
        const conversation = this.conversation();
        if (!conversation) {
            return null;
        }
        const partnerId = this.partnerId();
        return conversation.title
            || (partnerId ? this.friends().get(partnerId)?.userName : undefined)
            || this.messages().find(message => message.senderId === partnerId)?.senderName
            || 'Conversation';
    });

    /** The partner's photo in the header; a group shows its icon instead. */
    readonly partnerPicture = computed(() => this.isEventGroup() ? null : this.avatars.url(this.partnerId())());

    /** An event's group: no single partner, every member may write. */
    readonly isEventGroup = computed(() => this.conversation()?.type === ConversationType.EVENT);

    /** The media tab: the conversation's photos, newest first, read a page at a time. */
    readonly showMedia = signal(false);
    readonly mediaPhotos = signal<ConversationPhoto[]>([]);
    readonly mediaState = signal<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
    readonly mediaHasMore = signal(false);

    /**
     * Who moderates an event's group: its organizer, as wely-chat names them, or for groups
     * announced before that, the first member, where wely-events has always put the organizer.
     */
    readonly moderatorId = computed(() => {
        const conversation = this.conversation();
        if (conversation?.type !== ConversationType.EVENT) {
            return null;
        }
        return conversation.organizerId ?? conversation.participantIds?.[0] ?? null;
    });

    readonly memberCount = computed(() => this.conversation()?.participantIds?.length ?? 0);

    /** The other participant, once the conversation is loaded. */
    private readonly partnerId = signal<string | null>(null);

    /**
     * Their presence, re-read every {@link PRESENCE_POLL_MS} while the conversation is open. It
     * used to be a hardcoded « En ligne ». A failed read shows nothing rather than a stale answer.
     */
    readonly partnerPresence = toSignal(toObservable(this.partnerId).pipe(
        switchMap(partnerId => partnerId
            ? timer(0, PRESENCE_POLL_MS).pipe(switchMap(() =>
                this.chatService.getPresence(partnerId).pipe(catchError(() => of(null)))))
            : of(null))
    ), { initialValue: null });

    readonly presenceText = computed(() => presenceLabel(this.partnerPresence()));
    readonly isPartnerOnline = computed(() => this.partnerPresence()?.online === true);

    ngOnInit(): void {
        const currentUser = this.userService.getCurrentUserValue();
        this.currentUserId = currentUser ? currentUser.id : null;

        // Without the friend list the title falls back to a message's author, then « Conversation ».
        this.socialService.listFriendships()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: friends => this.friends.set(new Map(friends.map(friend => [friend.userId, friend]))),
                error: (err: unknown) => this.logger.error('ChatComponent', 'Could not load friends', err)
            });

        this.route.paramMap
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(params => {
                const convId = params.get('convId');
                this.convId.set(convId);

                if (convId) {
                    this.loadConversationById(convId);
                } else {
                    this.error.set('Discussion non spécifiée');
                    this.isLoading.set(false);
                }
            });

        // No NgZone.run around these writes any more. The RSocket callbacks arrive outside
        // Angular's zone, which is why the old code wrapped every assignment; a signal write
        // notifies the scheduler itself, so the zone no longer has to be re-entered for the
        // view to update.
        this.chatService.messages$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(message => this.onIncoming(message));
    }

    /** Upserts by id: a NEW message is appended once, an UPDATED one replaces the one shown. */
    private onIncoming(message: Message): void {
        const conversation = this.conversation();
        if (!conversation || message.conversationId !== conversation.id) {
            return;
        }
        const kind = message.kind ?? 'NEW';
        // The user's own new messages are already shown by the send path; an update to one is not.
        if (kind === 'NEW' && message.senderId === this.currentUserId) {
            return;
        }
        const entry = this.toChatMessage(message);
        if (kind === 'UPDATED') {
            // The thread rendered the sender's side; an update keeps it.
            entry.isMe = message.senderId === this.currentUserId;
        }
        this.messages.update(messages => upsertById(messages, message, kind));
        this.chatMessages.update(entries => upsertById(entries, entry, kind));
        if (message.photo?.removed) {
            this.dropFromMedia(message.id);
        }
    }

    loadConversationById(convId: string): void {
        this.isLoading.set(true);
        this.error.set(null);

        this.chatService.getConversationById(convId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (conversation) => this.handleConversationResponse(conversation),
                error: (err) => {
                    this.logger.error('ChatComponent', 'Error loading conversation by ID:', err);
                    this.error.set('Discussion introuvable');
                    this.isLoading.set(false);
                }
            });
    }

    private handleConversationResponse(conversation: Conversation): void {
        const sorted = [...(conversation.messages ?? [])].sort(byTimestamp);

        this.conversation.set(conversation);

        // Loading by conversation id gives no friend id, and a private conversation's presence needs
        // one: it is whichever participant is not the current user. A group has none.
        if (conversation.type === ConversationType.EVENT) {
            this.friendId = null;
        } else if (!this.friendId && conversation.participantIds) {
            this.friendId = conversation.participantIds
                .find(id => id !== this.currentUserId) ?? null;
        }
        this.partnerId.set(this.friendId);

        this.hasMoreHistory.set(conversation.bucketIndex > 0);
        this.messages.set(sorted);
        this.chatMessages.set(sorted.map(message => this.toChatMessage(message)));
        this.isLoading.set(false);
    }

    /**
     * Accepts either shape: only a message the user has just sent carries the pending and failed
     * flags, and those two are what the panel renders as a spinner or a retry marker.
     */
    private toChatMessage(message: Message | PendingMessage): ChatMessage {
        return {
            id: message.id,
            text: message.content,
            time: message.timestamp,
            isMe: message.senderId === this.currentUserId,
            senderName: message.senderName,
            senderId: message.senderId,
            system: isSystemMessage(message) || undefined,
            pending: 'pending' in message ? message.pending : undefined,
            failed: 'failed' in message ? message.failed : undefined,
            photo: 'photo' in message && message.photo ? bubblePhoto(message.photo) : undefined
        };
    }

    /** A photo may be removed by its sender, or in an event's group by its organizer. */
    canRemovePhotoOf(senderId: string | undefined): boolean {
        const me = this.currentUserId;
        return me !== null && (senderId === me || me === this.moderatorId());
    }

    /**
     * Shows the photo at once from the file, scales it down, sends it, then swaps in what the
     * server stored. A photo that cannot be sent stays in the thread, marked as not sent.
     */
    async onSendPhoto(file: File): Promise<void> {
        const conversation = this.conversation();
        if (!conversation) {
            return;
        }
        const localId = `local-photo-${Date.now()}`;
        const preview = URL.createObjectURL(file);
        this.chatMessages.update(entries => [...entries, {
            id: localId, text: '', time: new Date().toISOString(), isMe: true, pending: true,
            photo: { url: preview, width: 4, height: 3, removed: false }
        }]);
        const settle = (replacement: ChatMessage) => {
            URL.revokeObjectURL(preview);
            this.chatMessages.update(entries => entries.map(entry => entry.id === localId ? replacement : entry));
        };
        try {
            const scaled = await this.photoResizer.downscale(file);
            this.chatPhotos.send(conversation.id, scaled)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe({
                    next: stored => {
                        this.messages.update(messages => [...messages, stored]);
                        settle({ ...this.toChatMessage(stored), isMe: true });
                        this.forgetMedia();
                    },
                    error: (error: unknown) => {
                        this.logger.error('ChatComponent', 'Could not send the photo', error);
                        this.chatMessages.update(entries => entries.map(entry =>
                            entry.id === localId ? { ...entry, pending: false, failed: true } : entry));
                    }
                });
        } catch (error) {
            // The browser could not read the file: HEIC outside Safari, or not an image at all.
            this.logger.error('ChatComponent', 'Could not read the photo', error);
            settle({ id: localId, text: 'Ce format de photo n’est pas pris en charge.', time: new Date().toISOString(),
                isMe: true, failed: true });
        }
    }

    /** From the thread: the message's own photo. */
    openPhotoFromThread(message: ChatMessage): void {
        const photo = message.photo;
        if (!message.id || !photo?.url || photo.removed || message.pending) {
            return;
        }
        this.openViewer(message.id, photo.url, message.senderId, message.time);
    }

    /** From the media tab. */
    openPhotoFromMedia(photo: ConversationPhoto): void {
        if (photo.photo.url) {
            this.openViewer(photo.messageId, photo.photo.url, photo.senderId, photo.sentAt);
        }
    }

    toggleMedia(): void {
        this.showMedia.update(open => !open);
        if (this.showMedia() && this.mediaState() === 'idle') {
            this.loadMedia();
        }
    }

    /** The next page, from the oldest photo already shown. */
    loadMedia(): void {
        const conversation = this.conversation();
        if (!conversation || this.mediaState() === 'loading') {
            return;
        }
        const before = this.mediaPhotos().at(-1)?.sentAt;
        this.mediaState.set('loading');
        this.chatPhotos.page(conversation.id, before)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: page => {
                    this.mediaPhotos.update(photos => [...photos, ...page]);
                    this.mediaHasMore.set(page.length === MEDIA_PAGE_SIZE);
                    this.mediaState.set('ready');
                },
                error: (error: unknown) => {
                    this.logger.error('ChatComponent', 'Could not load the photos', error);
                    this.mediaState.set('unavailable');
                }
            });
    }

    private openViewer(messageId: string, url: string, senderId: string | undefined, sentAt: string | Date): void {
        const conversation = this.conversation();
        if (!conversation) {
            return;
        }
        const data: PhotoViewerData = {
            url,
            title: this.nameOf(senderId),
            subtitle: photoDate(sentAt),
            canRemove: this.canRemovePhotoOf(senderId),
            remove: () => this.chatPhotos.remove(conversation.id, messageId),
            removeError: error => error instanceof HttpErrorResponse && error.error?.code === 'CHT-BUS-007'
                ? 'Seul l’auteur de la photo, ou l’organisateur de l’événement, peut la retirer.'
                : null
        };
        const ref = this.dialog.open<PhotoViewerComponent, PhotoViewerData, PhotoViewerResult>(PhotoViewerComponent, {
            data,
            maxWidth: '96vw',
            panelClass: 'photo-viewer-panel'
        });
        this.shownPhoto = { messageId, ref };
        ref.afterClosed()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(result => {
                if (this.shownPhoto?.ref === ref) {
                    this.shownPhoto = null;
                }
                if (result === 'removed') {
                    this.markRemoved(messageId);
                }
            });
    }

    /** The viewer open right now, so a removal by someone else can close it. */
    private shownPhoto: { messageId: string; ref: MatDialogRef<PhotoViewerComponent, PhotoViewerResult> } | null = null;

    /** Removed for everyone: the thread keeps the message, the media tab drops it. */
    private markRemoved(messageId: string): void {
        const removed = { url: null, width: 0, height: 0, removed: true };
        this.chatMessages.update(entries => entries.map(entry => entry.id === messageId ? { ...entry, photo: removed } : entry));
        this.messages.update(messages => messages.map(message => message.id === messageId
            ? { ...message, photo: { width: 0, height: 0, removed: true } } : message));
        this.dropFromMedia(messageId);
    }

    /** Off the media tab, and out of the viewer if it shows it. */
    private dropFromMedia(messageId: string): void {
        this.mediaPhotos.update(photos => photos.filter(photo => photo.messageId !== messageId));
        if (this.shownPhoto?.messageId === messageId) {
            this.shownPhoto.ref.close(undefined);
            this.shownPhoto = null;
        }
    }

    /** A new photo makes the media tab stale: it is read again when next opened. */
    private forgetMedia(): void {
        if (!this.showMedia()) {
            this.mediaPhotos.set([]);
            this.mediaState.set('idle');
        }
    }

    private nameOf(senderId: string | undefined): string {
        if (senderId && senderId === this.currentUserId) {
            return 'Toi';
        }
        return (senderId ? this.friends().get(senderId)?.userName : undefined)
            ?? this.messages().find(message => message.senderId === senderId)?.senderName
            ?? 'Un membre';
    }

    onLoadMoreMessages(): void {
        const conversation = this.conversation();
        if (this.isHistoryLoading() || !conversation || conversation.bucketIndex <= 0) {
            return;
        }

        this.isHistoryLoading.set(true);
        const nextBucketIndex = conversation.bucketIndex - 1;

        this.chatService.getMessages(conversation.id, nextBucketIndex)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (bucket) => {
                    const older = [...bucket.messages].sort(byTimestamp);

                    this.conversation.update(current =>
                        current ? { ...current, bucketIndex: bucket.bucketIndex } : current);
                    this.isHistoryLoading.set(false);

                    // Prepending is what moves the scroll position, so the panel is given a frame
                    // to finish rendering the release of the loading state before the whole batch
                    // lands. SharedChatComponent anchors the scroll around this.
                    setTimeout(() => {
                        this.hasMoreHistory.set(bucket.bucketIndex > 0);
                        this.messages.update(messages => [...older, ...messages]);
                        this.chatMessages.update(entries =>
                            [...older.map(message => this.toChatMessage(message)), ...entries]);
                    }, HISTORY_PREPEND_DELAY_MS);
                },
                error: (err) => {
                    this.logger.error('ChatComponent', 'Error loading more messages:', err);
                    this.isHistoryLoading.set(false);
                }
            });
    }

    onSendMessage(content: string): void {
        const conversation = this.conversation();
        const isGroup = conversation?.type === ConversationType.EVENT;
        if (!content.trim() || !conversation || (!isGroup && !this.friendId)) {
            return;
        }

        this.isSending.set(true);

        // The stream emits twice: the optimistic copy, then the server-acknowledged version. The
        // second replaces the first rather than appearing next to it.
        let optimisticId: string | undefined;

        // wely-chat delivers to the stored members and ignores the receiver; a group has none to name.
        this.chatService.sendMessage(conversation.id, content, this.friendId ?? '')
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (message) => {
                    const entry = this.toChatMessage(message);
                    // isMe cannot be inferred from the sender on the optimistic copy, which has
                    // no server-assigned sender yet.
                    entry.isMe = true;

                    const existing = optimisticId
                        ? this.chatMessages().findIndex(candidate => candidate.id === optimisticId)
                        : -1;

                    if (existing >= 0) {
                        this.chatMessages.update(entries => [
                            ...entries.slice(0, existing),
                            entry,
                            ...entries.slice(existing + 1)
                        ]);
                    } else {
                        this.chatMessages.update(entries => [...entries, entry]);
                        this.messages.update(messages => [...messages, message]);
                    }

                    optimisticId = message.id;
                    this.isSending.set(message.pending);
                },
                error: (err) => {
                    this.logger.error('ChatComponent', 'message delivery failed', err);
                    this.error.set("Erreur lors de l'envoi du message");
                    this.isSending.set(false);
                }
            });
    }

    goBack(): void {
        this.navigationService.back();
    }

    /** From an event's group to the event itself. */
    openEvent(): void {
        const eventId = this.conversation()?.eventId;
        if (eventId) {
            this.router.navigate(['/event', eventId]);
        }
    }

    getAvatarInitial(title: string | undefined): string {
        return (title && title.length > 0) ? title.charAt(0).toUpperCase() : '?';
    }
}

/** What a bubble shows of a message's photo. */
function bubblePhoto(photo: MessagePhoto): NonNullable<ChatMessage['photo']> {
    return { url: photo.url ?? null, width: photo.width, height: photo.height, removed: photo.removed };
}

/** « 13 oct. 2026, 20:00 », under the author in the photo viewer. */
function photoDate(sentAt: string | Date): string {
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        .format(typeof sentAt === 'string' ? new Date(sentAt) : sentAt);
}

/** Oldest first, which is the order the panel renders. */
function byTimestamp(first: Message, second: Message): number {
    return new Date(first.timestamp).getTime() - new Date(second.timestamp).getTime();
}
