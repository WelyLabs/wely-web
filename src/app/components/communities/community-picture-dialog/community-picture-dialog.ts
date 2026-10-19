import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ImageCropperComponent, ImageCroppedEvent } from 'ngx-image-cropper';
import { Observable } from 'rxjs';

import { Community, communityErrorMessage } from '../../../models/community.model';
import { CommunityService } from '../../../services/community.service';
import { LoggerService } from '../../../core/logging/logger.service';
import { PendingTrailDirective } from '../../../core/ui/pending-trail.directive';
import { avatarColor, initialsOf } from '../../../core/ui/avatar';
import { MAX_SOURCE_BYTES } from '../../avatar-upload-dialog/avatar-upload-dialog.component';

/** What is uploaded: a square JPEG this wide, as wely-media keeps it. */
export const PICTURE_SIZE = 512;

/** Picks, crops square and uploads a community's picture, or removes it; admins only. Closes with the stored community. */
@Component({
  selector: 'app-community-picture-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, ImageCropperComponent, PendingTrailDirective],
  templateUrl: './community-picture-dialog.html',
  styleUrl: './community-picture-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityPictureDialogComponent {
  private readonly communities = inject(CommunityService);
  private readonly logger = inject(LoggerService);
  private readonly dialogRef = inject<MatDialogRef<CommunityPictureDialogComponent, Community | undefined>>(MatDialogRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly community = inject<Community>(MAT_DIALOG_DATA);
  readonly pictureSize = PICTURE_SIZE;
  readonly initials = initialsOf(this.community.name);
  readonly color = avatarColor(this.community.communityId);

  /** The picture in the cropper; null until one is picked. */
  readonly file = signal<File | null>(null);
  readonly blob = signal<Blob | null>(null);
  readonly saving = signal(false);
  readonly errorMessage = signal('');
  /** The current picture can go only while no new one is being cropped. */
  readonly canRemove = computed(() => !!this.community.pictureUrl && !this.file());

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
    this.errorMessage.set('Cette image ne peut pas être ouverte. Essayez un JPEG ou un PNG.');
  }

  save(): void {
    const blob = this.blob();
    if (!blob || this.saving()) {
      return;
    }
    this.send(this.communities.uploadPicture(this.community.communityId, blob), "L'envoi de l'image a échoué. Réessayez dans un instant.");
  }

  remove(): void {
    if (!this.canRemove() || this.saving()) {
      return;
    }
    this.send(this.communities.removePicture(this.community.communityId), "L'image n'a pas pu être retirée. Réessayez dans un instant.");
  }

  close(): void {
    this.dialogRef.close(undefined);
  }

  private send(request: Observable<Community>, fallback: string): void {
    this.saving.set(true);
    this.errorMessage.set('');
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (community) => {
        this.saving.set(false);
        this.dialogRef.close(community);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        const code = error instanceof HttpErrorResponse ? error.error?.code : undefined;
        this.errorMessage.set(communityErrorMessage(code) ?? fallback);
        this.logger.error('CommunityPictureDialogComponent', 'Could not change the community picture', error);
      },
    });
  }

  private pick(file: File): void {
    this.blob.set(null);
    if (file.size > MAX_SOURCE_BYTES) {
      this.file.set(null);
      this.errorMessage.set('Cette image dépasse 10 Mo. Choisissez-en une plus légère.');
      return;
    }
    this.errorMessage.set('');
    this.file.set(file);
  }
}
