import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { LoggerService } from '../../core/logging/logger.service';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatRippleModule } from '@angular/material/core';
import { ChatService } from '../../services/chat.service';
import { ConversationSummary } from '../../models/chat.model';
import { UserService } from '../../services/user.service';

/**
 * The user's conversations, most recently updated first.
 */
@Component({
    selector: 'app-conversations-list',
    standalone: true,
    imports: [CommonModule, MatButtonModule, MatIconModule, MatListModule, MatRippleModule],
    templateUrl: './conversations-list.html',
    styleUrl: './conversations-list.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConversationsListComponent implements OnInit {
    private readonly logger = inject(LoggerService);
    private readonly chatService = inject(ChatService);
    private readonly userService = inject(UserService);
    private readonly router = inject(Router);
    private readonly destroyRef = inject(DestroyRef);

    readonly conversations = signal<ConversationSummary[]>([]);
    readonly isLoading = signal(true);
    readonly error = signal<string | null>(null);

    private currentUserId: string | null = null;

    ngOnInit(): void {
        const currentUser = this.userService.getCurrentUserValue();
        this.currentUserId = currentUser ? currentUser.id : null;
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
        return prefix + conversation.lastMessage.content;
    }

    getAvatarInitial(title: string | undefined): string {
        return (title && title.length > 0) ? title.charAt(0).toUpperCase() : '?';
    }
}
