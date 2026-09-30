import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { LoggerService } from '../../core/logging/logger.service';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { UserService } from '../../services/user.service';
import { EditProfileDialogComponent } from '../edit-profile-dialog/edit-profile-dialog.component';

import { AvatarUploadDialogComponent } from '../avatar-upload-dialog/avatar-upload-dialog.component';

@Component({
    selector: 'app-user-profile',
    standalone: true,
    imports: [
        CommonModule,
        MatIconModule,
        MatButtonModule,
        MatChipsModule,
        MatTabsModule,
        MatDialogModule
    ],
    templateUrl: './user-profile.html',
    styleUrl: './user-profile.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
/** The signed-in user's own profile, with the two dialogs that edit it. */
export class UserProfileComponent implements OnInit {
    private readonly logger = inject(LoggerService);
    private readonly userService = inject(UserService);
    private readonly dialog = inject(MatDialog);
    private readonly destroyRef = inject(DestroyRef);

    /**
     * The user, read straight from the service's stream.
     *
     * <p>`toSignal` rather than a hand-written subscription: the previous version subscribed to
     * `currentUser$` — a long-lived subject — in `ngOnInit` and never unsubscribed, so every
     * visit to this page left a live subscriber behind. `toSignal` unsubscribes when the
     * component is destroyed, which is the whole reason to prefer it here.
     */
    readonly user = toSignal(this.userService.currentUser$);

    private readonly loadFailed = signal(false);

    /**
     * Derived rather than assigned in four places. Loading means exactly "no user yet, and the
     * load has not failed" — which the old boolean had to be kept in step with by hand, and one
     * of its four assignments was in an error callback that could fire after the user arrived.
     */
    readonly isLoading = computed(() => !this.user() && !this.loadFailed());

    ngOnInit(): void {
        this.reloadUserProfile();
    }

    reloadUserProfile(): void {
        this.loadFailed.set(false);

        this.userService.loadAndSetCurrentUser()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                error: (err) => {
                    this.logger.error('UserProfileComponent', 'Error loading profile:', err);
                    this.loadFailed.set(true);
                }
            });
    }

    openAvatarDialog(): void {
        const dialogRef = this.dialog.open(AvatarUploadDialogComponent, {
            width: '500px',
            panelClass: 'edit-profile-dialog',
            enterAnimationDuration: '300ms',
            exitAnimationDuration: '150ms'
        });

        // The dialog returns the cropped image, but the avatar URL is the server's to decide:
        // reloading the profile is what makes the displayed picture match what was stored.
        dialogRef.afterClosed()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(result => {
                if (result) {
                    this.reloadUserProfile();
                }
            });
    }

    /** Empty while the user is still loading, which is when the template shows its skeleton. */
    readonly initials = computed(() => {
        const user = this.user();
        if (!user) {
            return '';
        }
        return ((user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '')).toUpperCase();
    });

    openEditDialog(): void {
        const dialogRef = this.dialog.open(EditProfileDialogComponent, {
            width: '500px',
            data: this.user(),
            disableClose: false,
            panelClass: 'edit-profile-dialog'
        });

        // Updating the service propagates to every component reading currentUser$, this one
        // included — which is why nothing is assigned locally here.
        dialogRef.afterClosed()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(result => {
                if (result) {
                    this.userService.updateCurrentUser({
                        userName: result.userName,
                        firstName: result.firstName,
                        lastName: result.lastName,
                        email: result.email
                    });
                }
            });
    }
}
