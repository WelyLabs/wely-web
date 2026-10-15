import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmDialogData {
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    isDestructive?: boolean;
    /** Consequences listed under the message. */
    details?: readonly string[];
    /** What the user must type before confirming, such as their handle. */
    confirmationPhrase?: string;
    /** The label of the field the phrase is typed in. */
    confirmationLabel?: string;
}

/** Whether the typed text is the phrase, ignoring case and surrounding spaces. */
export function matchesConfirmationPhrase(typed: string, phrase: string): boolean {
    return typed.trim().toLowerCase() === phrase.trim().toLowerCase();
}

@Component({
    selector: 'app-confirm-dialog',
    standalone: true,
    imports: [MatDialogModule, MatButtonModule, MatIconModule],
    templateUrl: './confirm-dialog.html',
    styleUrl: './confirm-dialog.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
/** A yes/no dialog. Closes with `true` on confirm and `false` on cancel. */
export class ConfirmDialogComponent {
    readonly dialogRef = inject<MatDialogRef<ConfirmDialogComponent>>(MatDialogRef);
    readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);

    /** What the user typed in the confirmation field. */
    readonly typed = signal('');
    /** Confirming waits for the phrase, when there is one. */
    readonly canConfirm = computed(() =>
        !this.data.confirmationPhrase || matchesConfirmationPhrase(this.typed(), this.data.confirmationPhrase));

    onTyped(value: string): void {
        this.typed.set(value);
    }

    onConfirm(): void {
        if (!this.canConfirm()) {
            return;
        }
        this.dialogRef.close(true);
    }

    onCancel(): void {
        this.dialogRef.close(false);
    }
}
