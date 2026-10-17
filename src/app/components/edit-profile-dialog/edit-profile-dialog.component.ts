import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoggerService } from '../../core/logging/logger.service';

import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators, ReactiveFormsModule } from '@angular/forms';
import { map, of, switchMap } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ProfileUpdate, UserService } from '../../services/user.service';
import { User } from '../../models/user.model';
import { PendingTrailDirective } from '../../core/ui/pending-trail.directive';
import { birthDateBounds, birthDateError } from '../../models/birthday.model';

/** wely-users' code for a username someone else has. */
const USERNAME_TAKEN = 'USR-BUS-004';

/** Empty is allowed (nothing to change); anything else must be a date wely-users accepts. */
function birthDateValidator(control: AbstractControl<string | null>): ValidationErrors | null {
    const value = control.value;
    if (!value) {
        return null;
    }
    const message = birthDateError(value);
    return message ? { birthDate: message } : null;
}

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
    readonly birthBounds = birthDateBounds();
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
            lastName: [data.lastName, [Validators.required, Validators.minLength(2)]],
            birthDate: [data.birthDate ?? '', [birthDateValidator]]
        });
    }

    onSubmit(): void {
        if (this.profileForm.invalid) {
            return;
        }

        this.isLoading.set(true);
        this.errorMessage.set('');

        const { birthDate, ...names } = this.profileForm.getRawValue() as ProfileUpdate & { birthDate: string };
        const update: ProfileUpdate = names;
        // The birth date goes through the signup endpoint, only when it changed.
        const birthDateChanged = !!birthDate && birthDate !== (this.data.birthDate ?? '');

        this.userService.updateProfile(update)
            .pipe(
                switchMap(saved => birthDateChanged
                    ? this.userService.completeRegistration({ birthDate }).pipe(map(() => ({ ...saved, birthDate })))
                    : of(saved)),
                takeUntilDestroyed(this.destroyRef))
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
