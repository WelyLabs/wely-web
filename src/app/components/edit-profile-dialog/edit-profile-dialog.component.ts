import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoggerService } from '../../core/logging/logger.service';

import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { UserService } from '../../services/user.service';
import { User } from '../../models/user.model';

@Component({
    selector: 'app-edit-profile-dialog',
    standalone: true,
    imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    ReactiveFormsModule
],
    templateUrl: './edit-profile-dialog.component.html',
    styleUrl: './edit-profile-dialog.component.scss',
    // The form itself stays reactive rather than becoming signals: FormGroup already drives
    // change detection through its own observables, and Validators is what this screen needs.
    // Only the two pieces of state around it — loading and error — become signals.
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditProfileDialogComponent {
    private readonly logger = inject(LoggerService);
    private readonly fb = inject(FormBuilder);
    private readonly userService = inject(UserService);
    private readonly dialogRef = inject<MatDialogRef<EditProfileDialogComponent>>(MatDialogRef);
    private readonly destroyRef = inject(DestroyRef);

    readonly data = inject<User>(MAT_DIALOG_DATA);

    readonly profileForm: FormGroup;
    readonly isLoading = signal(false);
    readonly errorMessage = signal('');

    constructor() {
        const data = this.data;

        this.profileForm = this.fb.group({
            userName: [data.userName, [
                Validators.required,
                Validators.minLength(3),
                Validators.pattern(/^[a-zA-Z0-9_-]+$/) // Alphanumeric, underscore, hyphen only
            ]],
            firstName: [data.firstName, [Validators.required, Validators.minLength(2)]],
            lastName: [data.lastName, [Validators.required, Validators.minLength(2)]],
            email: [data.email, [Validators.required, Validators.email]]
        });
    }

    onSubmit(): void {
        if (this.profileForm.invalid) {
            return;
        }

        this.isLoading.set(true);
        this.errorMessage.set('');

        const updates = this.profileForm.value;

        this.userService.updateProfile(updates)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.isLoading.set(false);
                    // Returns the updated values rather than just true, so the caller does not
                    // have to reload the profile to learn what changed.
                    this.dialogRef.close(updates);
                },
                error: (err) => {
                    this.isLoading.set(false);
                    this.errorMessage.set('Erreur lors de la mise à jour du profil. Veuillez réessayer.');
                    this.logger.error('EditProfileDialogComponent', 'Error updating profile:', err);
                }
            });
    }

    onCancel(): void {
        this.dialogRef.close(false);
    }
}
