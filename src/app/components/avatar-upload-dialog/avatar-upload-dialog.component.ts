import { Component, inject } from '@angular/core';
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
    styleUrls: ['./avatar-upload-dialog.component.scss']
})
export class AvatarUploadDialogComponent {
    private readonly logger = inject(LoggerService);
    dialogRef = inject<MatDialogRef<AvatarUploadDialogComponent>>(MatDialogRef);
    private userService = inject(UserService);

    /** Handed straight to ngx-image-cropper, which reads the file input's own event. */
    imageChangedEvent: Event | '' = '';
    croppedImage = '';
    blob: Blob | null = null;
    scale = 1;
    isDragging = false;
    isLoading = false;

    fileChangeEvent(event: Event): void {
        this.imageChangedEvent = event;
    }

    imageCropped(event: ImageCroppedEvent) {
        if (event.base64) {
            this.croppedImage = event.base64;
            this.blob = event.blob || null;
        }
    }

    // ngx-image-cropper requires these three outputs to be bound, and there is nothing
    // to do on any of them: the cropper shows itself, and a failed load is already
    // visible to the user. Kept as no-ops rather than removed, because unbinding them
    // in the template would make the cropper log a warning.
    imageLoaded(_image: LoadedImage) {
        // Nothing to do: the cropper reveals itself.
    }

    cropperReady() {
        // Nothing to do.
    }

    loadImageFailed() {
        // Nothing to do: the cropper renders its own failure state.
    }

    onZoomChange(event: { value: number | null }) {
        this.scale = event.value ?? 1;
    }

    save() {
        if (this.blob) {
            this.isLoading = true;
            const file = new File([this.blob], 'avatar.png', { type: 'image/png' });
            this.userService.uploadAvatar(file).subscribe({
                next: () => {
                    this.isLoading = false;
                    this.dialogRef.close(this.croppedImage);
                },
                error: (err) => {
                    this.logger.error('AvatarUploadDialogComponent', 'Upload failed', err);
                    this.isLoading = false;
                }
            });
        }
    }

    close() {
        this.dialogRef.close();
    }
}
