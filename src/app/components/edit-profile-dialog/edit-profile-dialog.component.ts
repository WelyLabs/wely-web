import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
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
        CommonModule,
        MatDialogModule,
        MatButtonModule,
        MatFormFieldModule,
        MatInputModule,
        MatIconModule,
        ReactiveFormsModule
    ],
    templateUrl: './edit-profile-dialog.component.html',
    styleUrl: './edit-profile-dialog.component.scss'
})
export class EditProfileDialogComponent {
    profileForm: FormGroup;
    isLoading = false;
    errorMessage = '';

    constructor(
        private fb: FormBuilder,
        private userService: UserService,
        private dialogRef: MatDialogRef<EditProfileDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: User
    ) {
        this.profileForm = this.fb.group({
            username: [data.username, [
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

        this.isLoading = true;
        this.errorMessage = '';

        const updates = this.profileForm.value;

        this.userService.updateProfile(updates).subscribe({
            next: () => {
                this.isLoading = false;
                // Return the updated values instead of just true
                this.dialogRef.close(updates);
            },
            error: (err) => {
                this.isLoading = false;
                this.errorMessage = 'Erreur lors de la mise à jour du profil. Veuillez réessayer.';
                console.error('Error updating profile:', err);
            }
        });
    }

    onCancel(): void {
        this.dialogRef.close(false);
    }
}
