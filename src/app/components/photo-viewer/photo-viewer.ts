import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { ChatPhotoService } from '../../services/chat-photo.service';
import { LoggerService } from '../../core/logging/logger.service';
import { PendingTrailDirective } from '../../core/ui/pending-trail.directive';

export interface PhotoViewerData {
  conversationId: string;
  messageId: string;
  url: string;
  senderName: string;
  sentAt: string;
  /** The sender, or the event's organizer in its group: the server checks it again. */
  canRemove: boolean;
}

/** Closes with 'removed' once the photo is gone for everyone. */
export type PhotoViewerResult = 'removed' | undefined;

/** A photo of a conversation, full size, with its author and date; removable by whoever may. */
@Component({
  selector: 'app-photo-viewer',
  standalone: true,
  imports: [DatePipe, MatDialogModule, MatIconModule, PendingTrailDirective],
  templateUrl: './photo-viewer.html',
  styleUrl: './photo-viewer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PhotoViewerComponent {
  private readonly photos = inject(ChatPhotoService);
  private readonly logger = inject(LoggerService);
  private readonly dialogRef = inject<MatDialogRef<PhotoViewerComponent, PhotoViewerResult>>(MatDialogRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly data = inject<PhotoViewerData>(MAT_DIALOG_DATA);
  readonly removing = signal(false);
  readonly confirming = signal(false);
  readonly errorMessage = signal('');

  /** Two taps: removing a photo is for everyone and cannot be undone. */
  remove(): void {
    if (!this.confirming()) {
      this.confirming.set(true);
      return;
    }
    if (this.removing()) {
      return;
    }
    this.removing.set(true);
    this.errorMessage.set('');
    this.photos.remove(this.data.conversationId, this.data.messageId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.dialogRef.close('removed'),
        error: (error: unknown) => {
          this.removing.set(false);
          this.confirming.set(false);
          const code = error instanceof HttpErrorResponse ? error.error?.code : undefined;
          this.errorMessage.set(code === 'CHT-BUS-007'
            ? 'Seul l’auteur de la photo, ou l’organisateur de l’événement, peut la retirer.'
            : 'La photo n’a pas pu être retirée. Réessaie dans un instant.');
          this.logger.error('PhotoViewerComponent', 'Could not remove the photo', error);
        }
      });
  }

  close(): void {
    this.dialogRef.close(undefined);
  }
}
