import { Component, inject } from '@angular/core';

import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmDialogData {
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    isDestructive?: boolean;
}

@Component({
    selector: 'app-confirm-dialog',
    standalone: true,
    imports: [MatDialogModule, MatButtonModule, MatIconModule],
    templateUrl: './confirm-dialog.html',
    styleUrl: './confirm-dialog.scss'
})
export class ConfirmDialogComponent {
    dialogRef = inject<MatDialogRef<ConfirmDialogComponent>>(MatDialogRef);
    data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);


    onConfirm(): void {
        this.dialogRef.close(true);
    }

    onCancel(): void {
        this.dialogRef.close(false);
    }
}
