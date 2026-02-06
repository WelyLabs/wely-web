import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatRippleModule } from '@angular/material/core';
import { ChatService } from '../../services/chat.service';
import { ConversationSummary, ConversationType } from '../../models/chat.model';
import { UserService } from '../../services/user.service';

@Component({
    selector: 'app-conversations-list',
    standalone: true,
    imports: [CommonModule, MatButtonModule, MatIconModule, MatListModule, MatRippleModule],
    templateUrl: './conversations-list.html',
    styleUrl: './conversations-list.scss'
})
export class ConversationsListComponent implements OnInit {
    conversations: ConversationSummary[] = [];
    isLoading = true;
    error: string | null = null;
    currentUserId: string | null = null;

    constructor(
        private chatService: ChatService,
        private userService: UserService,
        private router: Router
    ) { }

    ngOnInit() {
        const currentUser = this.userService.getCurrentUserValue();
        this.currentUserId = currentUser ? currentUser.id : null;
        this.loadConversations();
    }

    loadConversations() {
        this.isLoading = true;
        this.chatService.getAllConversations().subscribe({
            next: (convs) => {
                this.conversations = convs.sort((a, b) =>
                    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                );
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Error loading conversations:', err);
                this.error = 'Impossible de charger vos conversations';
                this.isLoading = false;
            }
        });
    }

    openConversation(summary: ConversationSummary) {
        // Navigate using the unified conversation route
        this.router.navigate(['/chat', summary.id]);
    }

    getLastMessageContent(conv: ConversationSummary): string {
        if (!conv.lastMessage) return 'Pas encore de messages';

        const prefix = conv.lastMessage.senderId === this.currentUserId ? 'Vous: ' : '';
        return prefix + conv.lastMessage.content;
    }

    getAvatarInitial(title: string | undefined): string {
        return (title && title.length > 0) ? title.charAt(0).toUpperCase() : '?';
    }
}
