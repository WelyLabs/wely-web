import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ImageCropperComponent, ImageCroppedEvent } from 'ngx-image-cropper';

import { EventService, FeedEvent } from '../../services/event.service';
import { LoggerService } from '../../core/logging/logger.service';
import { PendingTrailDirective } from '../../core/ui/pending-trail.directive';
import { eventMediaError } from '../../core/ui/event-media-errors';
import { MAX_SOURCE_BYTES } from '../avatar-upload-dialog/avatar-upload-dialog.component';

/** What is uploaded: a 16:9 JPEG at most this wide. */
export const COVER_WIDTH = 1600;
export const COVER_ASPECT_RATIO = 16 / 9;

export interface EventCoverDialogData {
  /**
   * The event the cover belongs to: set when editing, so the cropped picture is uploaded right
   * away. Left out while creating an event, which does not exist yet: the dialog then only crops
   * and hands the picture back, for the caller to upload once the event is saved.
   */
  eventId?: string;
  /** The picture picked on the event page. */
  file: File;
}

/** Closes with the stored event when it uploaded the cover, or the cropped Blob when it only cropped. */
export type EventCoverDialogResult = FeedEvent | Blob | undefined;

/** Crops a picture to 16:9 and uploads it as the event's cover, or hands the crop back when creating. */
@Component({
  selector: 'app-event-cover-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, ImageCropperComponent, PendingTrailDirective],
  templateUrl: './event-cover-dialog.html',
  styleUrl: './event-cover-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventCoverDialogComponent {
  private readonly eventService = inject(EventService);
  private readonly logger = inject(LoggerService);
  private readonly dialogRef = inject<MatDialogRef<EventCoverDialogComponent, EventCoverDialogResult>>(MatDialogRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly data = inject<EventCoverDialogData>(MAT_DIALOG_DATA);
  readonly coverWidth = COVER_WIDTH;
  readonly aspectRatio = COVER_ASPECT_RATIO;

  /** The picture in the cropper; null when none can be shown. */
  readonly file = signal<File | null>(null);
  readonly blob = signal<Blob | null>(null);
  readonly saving = signal(false);
  readonly errorMessage = signal('');

  constructor() {
    this.pick(this.data.file);
  }

  /** Another picture, from the dialog's own picker. */
  fileChangeEvent(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (file) {
      this.pick(file);
    }
    if (input) {
      input.value = '';
    }
  }

  /** The cropper hands a Blob: `output` defaults to 'blob'. */
  imageCropped(event: ImageCroppedEvent): void {
    this.blob.set(event.blob ?? null);
  }

  loadImageFailed(): void {
    this.file.set(null);
    this.blob.set(null);
    this.errorMessage.set('Cette image ne peut pas être ouverte. Essaie un JPEG ou un PNG.');
  }

  save(): void {
    const blob = this.blob();
    if (!blob || this.saving()) {
      return;
    }
    const eventId = this.data.eventId;
    if (!eventId) {
      // Creating an event: it has no id yet, so hand the crop back for the caller to upload.
      this.dialogRef.close(blob);
      return;
    }
    this.saving.set(true);
    this.errorMessage.set('');
    this.eventService.uploadCover(eventId, blob)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: event => {
          this.saving.set(false);
          this.dialogRef.close(event);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(eventMediaError(error, 'L’envoi de la couverture a échoué. Réessaie dans un instant.'));
          this.logger.error('EventCoverDialogComponent', 'Could not upload the cover', error);
        }
      });
  }

  close(): void {
    this.dialogRef.close(undefined);
  }

  private pick(file: File): void {
    this.blob.set(null);
    if (file.size > MAX_SOURCE_BYTES) {
      this.file.set(null);
      this.errorMessage.set('Cette image dépasse 10 Mo. Choisis-en une plus légère.');
      return;
    }
    this.errorMessage.set('');
    this.file.set(file);
  }
}
