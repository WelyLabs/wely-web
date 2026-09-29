import { Component, inject } from '@angular/core';
import { LoggerService } from '../../core/logging/logger.service';

import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { SocialService } from '../../services/social.service';
import { finalize } from 'rxjs';

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
    styleUrl: './add-friend-dialog.scss'
})
export class AddFriendDialogComponent {
    private readonly logger = inject(LoggerService);
    dialogRef = inject<MatDialogRef<AddFriendDialogComponent>>(MatDialogRef);
    private socialService = inject(SocialService);

    userTag = '';
    isLoading = false;
    errorMessage: string | null = null;

    onAdd() {
        if (!this.userTag) return;

        this.isLoading = true;
        this.errorMessage = null;

        this.socialService.sendFriendRequest(this.userTag).pipe(
            finalize(() => this.isLoading = false)
        ).subscribe({
            next: () => {
                this.dialogRef.close(true);
            },
            error: (err) => {
                this.logger.error('AddFriendDialogComponent', 'Error sending friend request:', err);
                if (err.status === 404) {
                    this.errorMessage = "Utilisateur non trouvé.";
                } else if (err.status === 409) {
                    this.errorMessage = "Une demande est déjà en cours ou vous êtes déjà amis.";
                } else {
                    this.errorMessage = "Une erreur est survenue lors de l'envoi de la demande.";
                }
            }
        });
    }

    onCancel() {
        this.dialogRef.close(false);
    }
}
