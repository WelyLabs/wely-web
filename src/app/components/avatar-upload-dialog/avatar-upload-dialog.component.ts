import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoggerService } from '../../core/logging/logger.service';

import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { ImageCropperComponent, ImageCroppedEvent, LoadedImage } from 'ngx-image-cropper';
import { UserService } from '../../services/user.service';

import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-avatar-upload-dialog',
    standalone: true,
    imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSliderModule,
    ImageCropperComponent
],
    templateUrl: './avatar-upload-dialog.component.html',
    styleUrls: ['./avatar-upload-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
/** Crops a picture client-side and uploads the result as the user's avatar. */
export class AvatarUploadDialogComponent {
    private readonly logger = inject(LoggerService);
    private readonly userService = inject(UserService);
    private readonly destroyRef = inject(DestroyRef);

    readonly dialogRef = inject<MatDialogRef<AvatarUploadDialogComponent>>(MatDialogRef);

    /**
     * Handed straight to ngx-image-cropper, which reads the file input's own event.
     *
     * <p>`null` rather than the empty string the field used to hold: that is what the cropper's
     * own input accepts, and the empty string only ever meant "nothing selected".
     */
    readonly imageChangedEvent = signal<Event | null>(null);
    readonly croppedImage = signal('');
    readonly blob = signal<Blob | null>(null);
    readonly scale = signal(1);
    readonly isDragging = signal(false);
    readonly isLoading = signal(false);

    fileChangeEvent(event: Event): void {
        this.imageChangedEvent.set(event);
    }

    imageCropped(event: ImageCroppedEvent): void {
        if (event.base64) {
            this.croppedImage.set(event.base64);
            this.blob.set(event.blob ?? null);
        }
    }

    // ngx-image-cropper requires these three outputs to be bound, and there is nothing
    // to do on any of them: the cropper shows itself, and a failed load is already
    // visible to the user. Kept as no-ops rather than removed, because unbinding them
    // in the template would make the cropper log a warning.
    imageLoaded(_image: LoadedImage): void {
        // Nothing to do: the cropper reveals itself.
    }

    cropperReady(): void {
        // Nothing to do.
    }

    loadImageFailed(): void {
        // Nothing to do: the cropper renders its own failure state.
    }

    onZoomChange(event: { value: number | null }): void {
        this.scale.set(event.value ?? 1);
    }

    save(): void {
        const blob = this.blob();
        if (!blob) {
            return;
        }

        this.isLoading.set(true);
        const file = new File([blob], 'avatar.png', { type: 'image/png' });

        this.userService.uploadAvatar(file)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.isLoading.set(false);
                    this.dialogRef.close(this.croppedImage());
                },
                error: (err) => {
                    this.logger.error('AvatarUploadDialogComponent', 'Upload failed', err);
                    this.isLoading.set(false);
                }
            });
    }

    close(): void {
        this.dialogRef.close();
    }
}
