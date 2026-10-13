import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoggerService } from '../../core/logging/logger.service';

import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ProfileUpdate, UserService } from '../../services/user.service';
import { User } from '../../models/user.model';
import { PendingTrailDirective } from '../../core/ui/pending-trail.directive';

/** wely-users' code for a username someone else has. */
const USERNAME_TAKEN = 'USR-BUS-004';

@Component({
    selector: 'app-edit-profile-dialog',
    standalone: true,
    imports: [
    PendingTrailDirective,
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
                Validators.maxLength(30),
                Validators.pattern(/^[a-zA-Z0-9_-]+$/) // Alphanumeric, underscore, hyphen only
            ]],
            firstName: [data.firstName, [Validators.required, Validators.minLength(2)]],
            lastName: [data.lastName, [Validators.required, Validators.minLength(2)]]
        });
    }

    onSubmit(): void {
        if (this.profileForm.invalid) {
            return;
        }

        this.isLoading.set(true);
        this.errorMessage.set('');

        const update: ProfileUpdate = this.profileForm.getRawValue();

        this.userService.updateProfile(update)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: saved => {
                    this.isLoading.set(false);
                    // The profile as stored, which may differ from what was typed: the username
                    // comes back lowercased.
                    this.dialogRef.close(saved);
                },
                error: (err: unknown) => {
                    this.isLoading.set(false);
                    if (err instanceof HttpErrorResponse && err.error?.code === USERNAME_TAKEN) {
                        // On the field itself, which is what there is to change.
                        this.profileForm.get('userName')?.setErrors({ taken: true });
                        this.profileForm.get('userName')?.markAsTouched();
                        return;
                    }
                    this.errorMessage.set('Erreur lors de la mise à jour du profil. Veuillez réessayer.');
                    this.logger.error('EditProfileDialogComponent', 'Error updating profile:', err);
                }
            });
    }

    onCancel(): void {
        this.dialogRef.close(false);
    }
}
