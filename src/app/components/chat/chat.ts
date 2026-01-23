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
    conversation: Conversation | null = null;
    messages: Message[] = [];
    chatMessages: ChatMessage[] = []; // UI Model
    isLoading = true;
    isSending = false;
    error: string | null = null;
    friendId: string | null = null;
    currentUserId: string | null = null;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private chatService: ChatService,
        private userService: UserService,
        private ngZone: NgZone
    ) { }

    ngOnInit() {
        // Get current user ID
        const currentUser = this.userService.getCurrentUserValue();

        this.currentUserId = currentUser ? currentUser.id : null;

        this.friendId = this.route.snapshot.paramMap.get('friendId');
        if (this.friendId) {
            this.loadConversation(this.friendId);
        } else {
            this.error = 'Ami non spécifié';
            this.isLoading = false;
        }

        // Subscribe to real-time messages from RSocket stream
        this.messagesSubscription = this.chatService.messages$.subscribe(msg => {
            // Run inside Angular zone to trigger change detection
            this.ngZone.run(() => {
                console.log('📥 Message reçu dans le chat:', msg);

                // Only add message if it belongs to current conversation and is not from current user
                if (this.conversation && msg.conversationId === this.conversation.id && msg.senderId !== this.currentUserId) {

                    this.messages = [...this.messages, msg];
                    // Create new array reference to trigger Angular change detection
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
    }

    loadConversation(friendId: string) {
        this.isLoading = true;
        this.error = null;
        this.chatService.getConversation(friendId).subscribe({
            next: (conv) => {
                console.log(conv);

                this.conversation = conv;
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

    onSendMessage(content: string) {
        if (!content.trim() || !this.conversation) return;

        this.isSending = true;
        this.chatService.sendMessage(this.conversation.id, content, this.friendId!).subscribe({
            next: (msg) => {
                this.messages.push(msg);
                // Optimistic push to UI
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
