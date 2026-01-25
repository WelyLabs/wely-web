import { Injectable, inject } from '@angular/core';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';
import { MessageToastComponent } from '../components/shared/toast/message-toast';
import { Message } from '../models/chat.model';

@Injectable({
    providedIn: 'root'
})
export class NotificationService {
    private snackBar = inject(MatSnackBar);

    showChatNotification(message: Message): void {
        const config: MatSnackBarConfig = {
            duration: 5000,
            horizontalPosition: 'right',
            verticalPosition: 'top',
            panelClass: ['chat-notification-panel'],
            data: message
        };

        this.snackBar.openFromComponent(MessageToastComponent, config);
    }

    showInfo(message: string): void {
        this.snackBar.open(message, 'Fermer', {
            duration: 3000,
            horizontalPosition: 'right',
            verticalPosition: 'bottom'
        });
    }
}
