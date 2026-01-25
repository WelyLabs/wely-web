import { Component, Inject, inject } from '@angular/core';
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
    styleUrl: './message-toast.scss'
})
export class MessageToastComponent {
    snackBarRef = inject(MatSnackBarRef);
    private router = inject(Router);

    constructor(@Inject(MAT_SNACK_BAR_DATA) public data: Message) { }

    navigateToConversation(): void {
        this.router.navigate(['/chat', this.data.senderId]);
        this.dismiss();
    }

    dismiss(): void {
        this.snackBarRef.dismiss();
    }
}
