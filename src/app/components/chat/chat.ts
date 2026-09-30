import { Component, OnInit, OnDestroy, NgZone, inject } from '@angular/core';
import { LoggerService } from '../../core/logging/logger.service';
import { Subscription } from 'rxjs';

import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { UserService } from '../../services/user.service';
import { ChatService } from '../../services/chat.service';
import { NavigationService } from '../../services/navigation.service';
import { Conversation, Message } from '../../models/chat.model';
import { SharedChatComponent, ChatMessage } from '../shared/chat/shared-chat';

@Component({
    selector: 'app-chat',
    standalone: true,
    imports: [MatButtonModule, MatIconModule, SharedChatComponent],
    templateUrl: './chat.html',
    styleUrl: './chat.scss'
})
export class ChatComponent implements OnInit, OnDestroy {
    private readonly logger = inject(LoggerService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private chatService = inject(ChatService);
    private userService = inject(UserService);
    private ngZone = inject(NgZone);
    private navigationService = inject(NavigationService);

    private messagesSubscription?: Subscription;
    private routeSubscription?: Subscription;
    conversation: Conversation | null = null;
    messages: Message[] = [];
    chatMessages: ChatMessage[] = []; // UI Model
    isLoading = true;
    isSending = false;
    error: string | null = null;
    friendId: string | null = null;
    convId: string | null = null;
    currentUserId: string | null = null;
    isHistoryLoading = false;
    hasMoreHistory = false;
    placeholder = 'Écrivez votre message...';

    ngOnInit() {
        const currentUser = this.userService.getCurrentUserValue();
        this.currentUserId = currentUser ? currentUser.id : null;

        this.routeSubscription = this.route.paramMap.subscribe(params => {
            this.convId = params.get('convId');

            if (this.convId) {
                this.loadConversationById(this.convId);
            } else {
                this.error = 'Discussion non spécifiée';
                this.isLoading = false;
            }
        });

        this.messagesSubscription = this.chatService.messages$.subscribe(msg => {
            this.ngZone.run(() => {
                if (this.conversation && msg.conversationId === this.conversation.id && msg.senderId !== this.currentUserId) {
                    this.messages = [...this.messages, msg];
                    this.chatMessages = [...this.chatMessages, {
                        id: msg.id,
                        text: msg.content,
                        time: msg.timestamp,
                        isMe: false,
                        senderName: msg.senderName
                    }];
                }
            });
        });
    }

    ngOnDestroy() {
        this.messagesSubscription?.unsubscribe();
        this.routeSubscription?.unsubscribe();
    }

    loadConversationById(convId: string) {
        this.isLoading = true;
        this.error = null;

        this.chatService.getConversationById(convId).subscribe({
            next: (conv) => this.handleConversationResponse(conv),
            error: (err) => {
                this.logger.error('ChatComponent', 'Error loading conversation by ID:', err);
                this.error = 'Discussion introuvable';
                this.isLoading = false;
            }
        });
    }

    private handleConversationResponse(conv: Conversation) {
        this.logger.debug('ChatComponent', '📦 Conversation loaded:', conv);
        this.conversation = conv;

        // If title is missing, try to derive it
        if (!this.conversation.title && conv.messages && conv.messages.length > 0) {
            const firstOtherMessage = conv.messages.find(m => m.senderId !== this.currentUserId);
            if (firstOtherMessage) {
                this.conversation.title = firstOtherMessage.senderName;
            }
        }

        // CRITICAL FIX: If friendId is missing (e.g. loaded by convId), find it in participants
        if (!this.friendId && conv.participantIds) {
            this.friendId = conv.participantIds.find(id => id !== this.currentUserId) || null;
            this.logger.debug('ChatComponent', '🎯 Detected friendId from participants:', this.friendId);
        }

        this.hasMoreHistory = conv.bucketIndex > 0;
        this.logger.debug('ChatComponent', '🚩 hasMoreHistory set to:', this.hasMoreHistory, 'Bucket:', conv.bucketIndex);

        if (conv.messages) {
            this.messages = conv.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        } else {
            this.messages = [];
        }
        this.updateChatMessages();
        this.isLoading = false;
    }

    private updateChatMessages() {
        this.chatMessages = this.messages.map(msg => ({
            id: msg.id,
            text: msg.content,
            time: msg.timestamp,
            isMe: msg.senderId === this.currentUserId,
            senderName: msg.senderName
        }));
    }

    onLoadMoreMessages() {
        if (this.isHistoryLoading || !this.conversation || this.conversation.bucketIndex <= 0) return;

        this.isHistoryLoading = true;
        const nextBucketIndex = this.conversation.bucketIndex - 1;

        this.chatService.getMessages(this.conversation.id, nextBucketIndex).subscribe({
            next: (bucket) => {
                this.ngZone.run(() => {
                    if (this.conversation) {
                        this.conversation.bucketIndex = bucket.bucketIndex;
                        const newMessages = bucket.messages.sort((a, b) =>
                            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

                        const newChatMessages: ChatMessage[] = newMessages.map(msg => ({
                            id: msg.id,
                            text: msg.content,
                            time: msg.timestamp,
                            isMe: msg.senderId === this.currentUserId,
                            senderName: msg.senderName
                        }));

                        this.isHistoryLoading = false;

                        // Give browser a moment to settle before prepending the whole batch
                        setTimeout(() => {
                            this.ngZone.run(() => {
                                if (this.conversation) {
                                    this.hasMoreHistory = bucket.bucketIndex > 0;
                                    this.messages = [...newMessages, ...this.messages];
                                    this.chatMessages = [...newChatMessages, ...this.chatMessages];
                                }
                            });
                        }, 50);
                    } else {
                        this.isHistoryLoading = false;
                    }
                });
            },
            error: (err) => {
                this.logger.error('ChatComponent', 'Error loading more messages:', err);
                this.isHistoryLoading = false;
            }
        });
    }

    onSendMessage(content: string) {
        if (!content.trim() || !this.conversation || !this.friendId) return;

        this.isSending = true;

        // Le flux émet deux fois : la copie optimiste, puis la version acquittée par
        // le serveur. La seconde remplace la première au lieu de s'ajouter à côté.
        let optimisticId: string | undefined;

        this.chatService.sendMessage(this.conversation.id, content, this.friendId).subscribe({
            next: (msg) => {
                const entry: ChatMessage = {
                    id: msg.id,
                    text: msg.content,
                    time: msg.timestamp,
                    isMe: true,
                    senderName: msg.senderName,
                    pending: msg.pending,
                    failed: msg.failed
                };

                const existing = optimisticId
                    ? this.chatMessages.findIndex(m => m.id === optimisticId)
                    : -1;

                if (existing >= 0) {
                    this.chatMessages = [
                        ...this.chatMessages.slice(0, existing),
                        entry,
                        ...this.chatMessages.slice(existing + 1)
                    ];
                } else {
                    this.chatMessages = [...this.chatMessages, entry];
                    this.messages = [...this.messages, msg];
                }

                optimisticId = msg.id;
                this.isSending = msg.pending;
            },
            error: (err) => {
                this.logger.error('ChatComponent', 'message delivery failed', err);
                this.error = 'Erreur lors de l\'envoi du message';
                this.isSending = false;
            }
        });
    }

    goBack() {
        this.navigationService.back();
    }

    getAvatarInitial(title: string | undefined): string {
        return (title && title.length > 0) ? title.charAt(0).toUpperCase() : '?';
    }
}
