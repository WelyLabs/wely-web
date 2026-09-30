import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Message } from '../../../models/chat.model';
import { Router } from '@angular/router';

@Component({
    selector: 'app-message-toast',
    standalone: true,
    imports: [CommonModule, MatIconModule, MatButtonModule],
    templateUrl: './message-toast.html',
    styleUrl: './message-toast.scss',
    // The toast renders one message, injected at construction and never changed.
    changeDetection: ChangeDetectionStrategy.OnPush
})
/** Snack bar shown when a message arrives for a conversation the user is not looking at. */
export class MessageToastComponent {
    readonly data = inject<Message>(MAT_SNACK_BAR_DATA);
    readonly snackBarRef = inject(MatSnackBarRef);
    private router = inject(Router);

    navigateToConversation(): void {
        this.router.navigate(['/chat', this.data.conversationId]);
        this.dismiss();
    }

    dismiss(): void {
        this.snackBarRef.dismiss();
    }
}
