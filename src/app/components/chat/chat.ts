import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { UserService } from '../../services/user.service';
import { ChatService } from '../../services/chat.service';
import { Conversation, Message } from '../../models/chat.model';

@Component({
    selector: 'app-chat',
    standalone: true,
    imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule],
    templateUrl: './chat.html',
    styleUrl: './chat.scss'
})
export class ChatComponent implements OnInit {
    conversation: Conversation | null = null;
    messages: Message[] = [];
    newMessage: string = '';
    isLoading = true;
    isSending = false;
    error: string | null = null;
    friendId: string | null = null;
    currentUserId: string | null = null;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private chatService: ChatService,
        private userService: UserService
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
    }

    loadConversation(friendId: string) {
        this.isLoading = true;
        this.error = null;
        this.chatService.getConversation(friendId).subscribe({
            next: (conv) => {
                this.conversation = conv;
                // Messages are now included in the conversation object
                if (conv.messages) {
                    this.messages = conv.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                } else {
                    this.messages = [];
                }
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Error loading conversation:', err);
                this.error = 'Impossible de charger la conversation';
                this.isLoading = false;
            }
        });
    }

    onSendMessage() {
        if (!this.newMessage.trim() || !this.conversation) return;

        this.isSending = true;
        this.chatService.sendMessage(this.conversation.id, this.newMessage).subscribe({
            next: (msg) => {
                this.messages.push(msg);
                this.newMessage = '';
                this.isSending = false;
                // Scroll to bottom would go here
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
