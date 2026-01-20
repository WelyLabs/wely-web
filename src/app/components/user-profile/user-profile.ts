import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { User } from '../../models/user.model';
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
    styleUrl: './user-profile.scss'
})
export class UserProfileComponent implements OnInit {
    user!: User;
    isLoading = true;

    constructor(
        private userService: UserService,
        private dialog: MatDialog
    ) { }

    ngOnInit() {
        // Subscribe to the reactive user stream
        this.userService.currentUser$.subscribe({
            next: (user) => {
                if (user) {
                    this.user = user;
                    this.isLoading = false;
                }
            },
            error: (err) => {
                console.error('Error loading profile:', err);
                this.isLoading = false;
            }
        });

        // Initial load
        this.reloadUserProfile();
    }

    reloadUserProfile(): void {
        this.isLoading = true;
        this.userService.loadAndSetCurrentUser().subscribe({
            error: (err) => {
                console.error('Error loading profile:', err);
                this.isLoading = false;
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

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                // Result is the cropped image URL (SafeUrl)
                // In a real app, we might want to reload the profile or update the avatar URL directly
                // For now, let's just reload the profile to simulate the update
                this.reloadUserProfile();
            }
        });
    }

    getInitials(): string {
        return (this.user.firstName[0] + this.user.lastName[0]).toUpperCase();
    }

    openEditDialog(): void {
        const dialogRef = this.dialog.open(EditProfileDialogComponent, {
            width: '500px',
            data: this.user,
            disableClose: false,
            panelClass: 'edit-profile-dialog'
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                // Update the user in the service - this will automatically propagate to all components
                this.userService.updateCurrentUser({
                    username: result.username,
                    firstName: result.firstName,
                    lastName: result.lastName,
                    email: result.email
                });
            }
        });
    }
}
