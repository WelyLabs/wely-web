import { Injectable, inject } from '@angular/core';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';
import { NotificationToastComponent } from '../components/shared/toast/notification-toast';
import { AppNotification } from '../models/notification.model';

@Injectable({
    providedIn: 'root'
})
export class NotificationService {
    private snackBar = inject(MatSnackBar);

    /** A notification from the notification center, while the app is open on another screen. */
    showNotification(notification: AppNotification): void {
        const config: MatSnackBarConfig = {
            duration: 5000,
            horizontalPosition: 'right',
            verticalPosition: 'top',
            panelClass: ['notification-toast-panel'],
            data: notification
        };

        this.snackBar.openFromComponent(NotificationToastComponent, config);
    }

    /** A short message with one action, which runs if the user takes it. */
    showAction(message: string, action: string, onAction: () => void): void {
        this.snackBar.open(message, action, {
            duration: 5000,
            horizontalPosition: 'right',
            verticalPosition: 'bottom'
        }).onAction().subscribe(onAction);
    }

    showInfo(message: string): void {
        this.snackBar.open(message, 'Fermer', {
            duration: 3000,
            horizontalPosition: 'right',
            verticalPosition: 'bottom'
        });
    }
}
