import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { UserService } from '../../services/user.service';
import { ChatService } from '../../services/chat.service';
import { Conversation, Message } from '../../models/chat.model';
import { SharedChatComponent, ChatMessage } from '../shared/chat/shared-chat';

@Component({
    selector: 'app-chat',
    standalone: true,
    imports: [CommonModule, MatButtonModule, MatIconModule, SharedChatComponent],
    templateUrl: './chat.html',
    styleUrl: './chat.scss'
})
export class ChatComponent implements OnInit, OnDestroy {
    private messagesSubscription?: Subscription;
    private routeSubscription?: Subscription;
    conversation: Conversation | null = null;
    messages: Message[] = [];
    chatMessages: ChatMessage[] = []; // UI Model
    isLoading = true;
    isSending = false;
    error: string | null = null;
    friendId: string | null = null;
    currentUserId: string | null = null;
    isHistoryLoading = false;
    hasMoreHistory = false;
    placeholder = 'Écrivez votre message...';

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private chatService: ChatService,
        private userService: UserService,
        private ngZone: NgZone
    ) { }

    ngOnInit() {
        const currentUser = this.userService.getCurrentUserValue();
        this.currentUserId = currentUser ? currentUser.id : null;

        this.routeSubscription = this.route.paramMap.subscribe(params => {
            this.friendId = params.get('friendId');
            if (this.friendId) {
                this.loadConversation(this.friendId);
            } else {
                this.error = 'Ami non spécifié';
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

    loadConversation(friendId: string) {
        this.isLoading = true;
        this.error = null;
        this.chatService.getConversation(friendId).subscribe({
            next: (conv) => {
                this.conversation = conv;
                this.hasMoreHistory = conv.bucketIndex > 0;

                if (conv.messages) {
                    this.messages = conv.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                } else {
                    this.messages = [];
                }
                this.updateChatMessages();
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Error loading conversation:', err);
                this.error = 'Impossible de charger la conversation';
                this.isLoading = false;
            }
        });
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
                console.error('Error loading more messages:', err);
                this.isHistoryLoading = false;
            }
        });
    }

    onSendMessage(content: string) {
        if (!content.trim() || !this.conversation) return;

        this.isSending = true;
        this.chatService.sendMessage(this.conversation.id, content, this.friendId!).subscribe({
            next: (msg) => {
                this.messages.push(msg);
                this.chatMessages.push({
                    id: msg.id,
                    text: msg.content,
                    time: msg.timestamp,
                    isMe: true,
                    senderName: msg.senderName
                });
                this.isSending = false;
            },
            error: (err) => {
                console.error('Error sending message:', err);
                this.error = 'Erreur lors de l\'envoi du message';
                this.isSending = false;
            }
        });
    }

    goBack() {
        this.router.navigate(['/friends']);
    }
}
