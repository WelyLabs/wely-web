import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
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
        CommonModule,
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
    imageChangedEvent: any = '';
    croppedImage: string = '';
    blob: Blob | null = null;
    scale = 1;
    isDragging = false;
    isLoading = false;

    constructor(
        public dialogRef: MatDialogRef<AvatarUploadDialogComponent>,
        private userService: UserService
    ) { }

    fileChangeEvent(event: any): void {
        this.imageChangedEvent = event;
    }

    imageCropped(event: ImageCroppedEvent) {
        if (event.base64) {
            this.croppedImage = event.base64;
            this.blob = event.blob || null;
        }
    }

    imageLoaded(image: LoadedImage) {
        // show cropper
    }

    cropperReady() {
        // cropper ready
    }

    loadImageFailed() {
        // show message
    }

    onZoomChange(event: any) {
        this.scale = event.value;
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
                    console.error('Upload failed', err);
                    this.isLoading = false;
                }
            });
        }
    }

    close() {
        this.dialogRef.close();
    }
}
