import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoggerService } from '../../core/logging/logger.service';

import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { ImageCropperComponent, ImageCroppedEvent, LoadedImage } from 'ngx-image-cropper';
import { UserService } from '../../services/user.service';
import { AvatarService } from '../../services/avatar.service';
import { HttpErrorResponse } from '@angular/common/http';

import { FormsModule } from '@angular/forms';

/** Pictures above this are refused before cropping: the phone's original, not what is sent. */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

/** What is uploaded: a 512 px JPEG, well under wely-users' 5 MB limit. */
export const UPLOAD_SIZE = 512;

/** What the user reads for each refusal wely-users can answer. */
const UPLOAD_ERRORS: Record<string, string> = {
    'USR-BUS-006': "Ce fichier n'est pas une image que l'on peut utiliser (JPEG, PNG, GIF ou BMP).",
    'USR-BUS-007': 'Cette image est trop lourde, même recadrée.'
};

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
    private readonly avatarService = inject(AvatarService);
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
    readonly errorMessage = signal('');

    readonly uploadSize = UPLOAD_SIZE;

    fileChangeEvent(event: Event): void {
        const file = (event.target as HTMLInputElement | null)?.files?.[0];
        if (file && file.size > MAX_SOURCE_BYTES) {
            this.errorMessage.set('Cette image dépasse 10 Mo. Choisissez-en une plus légère.');
            return;
        }
        this.errorMessage.set('');
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
        this.imageChangedEvent.set(null);
        this.errorMessage.set("Cette image ne peut pas être ouverte. Essayez un JPEG ou un PNG.");
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
        this.errorMessage.set('');
        const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });

        this.userService.uploadAvatar(file)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.isLoading.set(false);
                    const me = this.userService.getCurrentUserValue();
                    if (me) {
                        this.avatarService.invalidate(me.id);
                    }
                    this.dialogRef.close(this.croppedImage());
                },
                error: (err: unknown) => {
                    this.logger.error('AvatarUploadDialogComponent', 'Upload failed', err);
                    this.isLoading.set(false);
                    const code = err instanceof HttpErrorResponse ? err.error?.code : undefined;
                    this.errorMessage.set(UPLOAD_ERRORS[code] ?? "L'envoi de la photo a échoué. Réessayez dans un instant.");
                }
            });
    }

    close(): void {
        this.dialogRef.close();
    }
}
