import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoggerService } from '../../core/logging/logger.service';

import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { SocialService } from '../../services/social.service';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';

/** Sends a friend request to a user identified by their tag, `name#1234`. */
@Component({
    selector: 'app-add-friend-dialog',
    standalone: true,
    imports: [
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    FormsModule
],
    templateUrl: './add-friend-dialog.html',
    styleUrl: './add-friend-dialog.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddFriendDialogComponent {
    private readonly logger = inject(LoggerService);
    private readonly socialService = inject(SocialService);
    private readonly destroyRef = inject(DestroyRef);

    readonly dialogRef = inject<MatDialogRef<AddFriendDialogComponent>>(MatDialogRef);

    readonly userTag = signal('');
    readonly isLoading = signal(false);
    readonly errorMessage = signal<string | null>(null);

    onAdd(): void {
        const tag = this.userTag();
        if (!tag) {
            return;
        }

        this.isLoading.set(true);
        this.errorMessage.set(null);

        this.socialService.sendFriendRequest(tag).pipe(
            finalize(() => this.isLoading.set(false)),
            takeUntilDestroyed(this.destroyRef)
        ).subscribe({
            next: () => this.dialogRef.close(true),
            error: (err: HttpErrorResponse) => {
                this.logger.error('AddFriendDialogComponent', 'Error sending friend request:', err);
                this.errorMessage.set(this.messageFor(err.status));
            }
        });
    }

    onCancel(): void {
        this.dialogRef.close(false);
    }

    /** Maps the status the backend answered to something the user can act on. */
    private messageFor(status: number): string {
        switch (status) {
            case 404:
                return 'Utilisateur non trouvé.';
            case 409:
                return 'Une demande est déjà en cours ou vous êtes déjà amis.';
            default:
                return "Une erreur est survenue lors de l'envoi de la demande.";
        }
    }
}
