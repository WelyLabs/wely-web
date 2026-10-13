import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { LoggerService } from '../../core/logging/logger.service';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatRippleModule } from '@angular/material/core';
import { ChatService } from '../../services/chat.service';
import { SocialService } from '../../services/social.service';
import { FriendSummary } from '../../models/friendship.model';
import { catchError, forkJoin, map, of } from 'rxjs';
import { ConversationSummary, ConversationType } from '../../models/chat.model';
import { UserService } from '../../services/user.service';
import { AvatarService } from '../../services/avatar.service';

/** One row of the list: the conversation, and who it is with. */
export interface ConversationRow {
    conversation: ConversationSummary;
    name: string;
    avatarUrl: string | null;
    online: boolean;
}

/**
 * The user's conversations, most recently updated first, each named after the other participant.
 */
@Component({
    selector: 'app-conversations-list',
    standalone: true,
    // RouterLink: without it the routerLink attributes on « Nouveau » and « Trouver des amis » were inert.
    imports: [CommonModule, MatButtonModule, MatIconModule, MatListModule, MatRippleModule, RouterLink],
    templateUrl: './conversations-list.html',
    styleUrl: './conversations-list.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConversationsListComponent implements OnInit {
    private readonly logger = inject(LoggerService);
    private readonly chatService = inject(ChatService);
    private readonly userService = inject(UserService);
    private readonly socialService = inject(SocialService);
    private readonly avatars = inject(AvatarService);
    private readonly router = inject(Router);
    private readonly destroyRef = inject(DestroyRef);

    readonly conversations = signal<ConversationSummary[]>([]);
    /** The user's friends, by id: where a conversation partner's name and photo come from. */
    private readonly friends = signal<ReadonlyMap<string, FriendSummary>>(new Map());
    /** Partners online right now, read once per load from wely-chat. */
    private readonly onlinePartners = signal<ReadonlySet<string>>(new Set());

    /**
     * The rows as shown. A summary has no title, so the list used to read "?" with no name: the
     * name now comes from the friend list, or from the partner's last message, in that order.
     */
    readonly rows = computed<ConversationRow[]>(() => this.conversations().map(conversation => {
        const partnerId = this.partnerOf(conversation);
        const friend = partnerId ? this.friends().get(partnerId) : undefined;
        const lastFromPartner = conversation.lastMessage && conversation.lastMessage.senderId === partnerId
            ? conversation.lastMessage.senderName : undefined;
        return {
            conversation,
            name: conversation.title || friend?.userName || lastFromPartner || 'Conversation',
            avatarUrl: partnerId ? this.avatars.url(partnerId)() : null,
            online: !!partnerId && this.onlinePartners().has(partnerId)
        };
    }));
    readonly isLoading = signal(true);
    readonly error = signal<string | null>(null);

    private currentUserId: string | null = null;

    ngOnInit(): void {
        const currentUser = this.userService.getCurrentUserValue();
        this.currentUserId = currentUser ? currentUser.id : null;
        this.socialService.listFriendships()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: friends => this.friends.set(new Map(friends.map(friend => [friend.userId, friend]))),
                error: (err: unknown) => this.logger.error('ConversationsListComponent', 'Could not load friends', err)
            });
        this.loadConversations();
    }

    loadConversations(): void {
        this.isLoading.set(true);
        this.error.set(null);

        this.chatService.getAllConversations()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (conversations) => {
                    this.conversations.set([...conversations].sort((first, second) =>
                        new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
                    ));
                    this.isLoading.set(false);
                    this.loadPresence(conversations);
                },
                error: (err) => {
                    this.logger.error('ConversationsListComponent', 'Error loading conversations:', err);
                    this.error.set('Impossible de charger vos conversations');
                    this.isLoading.set(false);
                }
            });
    }

    openConversation(summary: ConversationSummary): void {
        this.router.navigate(['/chat', summary.id]);
    }

    getLastMessageContent(conversation: ConversationSummary): string {
        if (!conversation.lastMessage) {
            return 'Pas encore de messages';
        }

        const prefix = conversation.lastMessage.senderId === this.currentUserId ? 'Vous: ' : '';
        const photo = conversation.lastMessage.photo;
        if (photo && !conversation.lastMessage.content) {
            return prefix + (photo.removed ? 'Photo retirée' : 'Photo');
        }
        return prefix + conversation.lastMessage.content;
    }

    /** The participant who is not the current user; none for a group, which is named by its title. */
    private partnerOf(conversation: ConversationSummary): string | null {
        if (conversation.type === ConversationType.EVENT) {
            return null;
        }
        return conversation.participantIds?.find(id => id !== this.currentUserId) ?? null;
    }

    /** One presence read per partner; one that cannot be read simply shows no dot. */
    private loadPresence(conversations: ConversationSummary[]): void {
        const partners = [...new Set(conversations.flatMap(conversation => this.partnerOf(conversation) ?? []))];
        if (partners.length === 0) {
            return;
        }
        forkJoin(partners.map(partnerId => this.chatService.getPresence(partnerId).pipe(
            map(presence => presence.online ? partnerId : null),
            catchError(() => of(null)))))
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(online => this.onlinePartners.set(new Set(online.filter((id): id is string => id !== null))));
    }

    getAvatarInitial(title: string | undefined): string {
        return (title && title.length > 0) ? title.charAt(0).toUpperCase() : '?';
    }
}
