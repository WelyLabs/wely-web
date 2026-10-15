import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AvatarService } from '../../services/avatar.service';
import { avatarColor, initialsOf } from '../../core/ui/avatar';

/** Someone the event can be handed over to. */
export interface HandOverCandidate {
  id: string;
  name: string;
}

export interface HandOverDialogData {
  people: HandOverCandidate[];
}

/** The id of the chosen successor; undefined when the organizer gave up. */
export type HandOverDialogResult = string | undefined;

/** The organizer leaves: they pick who organizes the event after them. */
@Component({
  selector: 'app-hand-over-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './hand-over-dialog.html',
  styleUrl: './hand-over-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HandOverDialogComponent {
  readonly dialogRef = inject<MatDialogRef<HandOverDialogComponent, HandOverDialogResult>>(MatDialogRef);
  readonly data = inject<HandOverDialogData>(MAT_DIALOG_DATA);
  private readonly avatars = inject(AvatarService);

  readonly chosen = signal<string | null>(null);

  readonly avatarColor = avatarColor;
  readonly initialsOf = initialsOf;

  pictureOf(id: string): string | null {
    return this.avatars.url(id)();
  }

  choose(id: string): void {
    this.chosen.set(id);
  }

  onConfirm(): void {
    const id = this.chosen();
    if (id) {
      this.dialogRef.close(id);
    }
  }

  onCancel(): void {
    this.dialogRef.close(undefined);
  }
}
