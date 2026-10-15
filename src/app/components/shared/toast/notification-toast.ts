import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import { AppNotification, notificationIcon } from '../../../models/notification.model';
import { NotificationCenterService } from '../../../services/notification-center.service';

/** Snack bar for a notification that arrives while the app is open, on another screen. */
@Component({
    selector: 'app-notification-toast',
    imports: [DatePipe, MatIconModule, MatButtonModule],
    templateUrl: './notification-toast.html',
    styleUrl: './notification-toast.scss',
    // One notification, injected at construction and never changed.
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationToastComponent {
    readonly data = inject<AppNotification>(MAT_SNACK_BAR_DATA);
    private readonly snackBarRef = inject(MatSnackBarRef);
    private readonly router = inject(Router);
    private readonly center = inject(NotificationCenterService);

    readonly icon = notificationIcon(this.data.type);

    open(): void {
        this.center.markRead([this.data.id]);
        void this.router.navigateByUrl(this.data.link);
        this.dismiss();
    }

    dismiss(): void {
        this.snackBarRef.dismiss();
    }
}
