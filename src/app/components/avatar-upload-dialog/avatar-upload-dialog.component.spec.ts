import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AvatarUploadDialogComponent } from './avatar-upload-dialog.component';
import { MatDialogRef } from '@angular/material/dialog';
import { UserService } from '../../services/user.service';
import { AvatarService } from '../../services/avatar.service';
import { HttpErrorResponse } from '@angular/common/http';
import { MAX_SOURCE_BYTES } from './avatar-upload-dialog.component';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ImageCropperComponent, ImageCroppedEvent } from 'ngx-image-cropper';

describe('AvatarUploadDialogComponent', () => {
    let component: AvatarUploadDialogComponent;
    let fixture: ComponentFixture<AvatarUploadDialogComponent>;
    let dialogRefMock: any;
    let userServiceMock: any;
    let avatarServiceMock: { invalidate: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
        dialogRefMock = {
            close: vi.fn()
        };
        userServiceMock = {
            uploadAvatar: vi.fn().mockReturnValue(of({ profilePicUrl: 'new-url' })),
            getCurrentUserValue: vi.fn().mockReturnValue({ id: 'me' })
        };
        avatarServiceMock = { invalidate: vi.fn() };

        await TestBed.configureTestingModule({
            imports: [AvatarUploadDialogComponent, NoopAnimationsModule, ImageCropperComponent],
            providers: [
                { provide: MatDialogRef, useValue: dialogRefMock },
                { provide: UserService, useValue: userServiceMock },
                { provide: AvatarService, useValue: avatarServiceMock }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(AvatarUploadDialogComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should handle image cropping', () => {
        const mockEvent = {
            base64: 'data:image/png;base64,...',
            blob: new Blob()
        } as ImageCroppedEvent;

        component.imageCropped(mockEvent);

        expect(component.croppedImage()).toBe('data:image/png;base64,...');
        expect(component.blob()).toEqual(mockEvent.blob);
    });

    it('should ignore a crop event that carries no image', () => {
        component.imageCropped({ base64: '' } as ImageCroppedEvent);

        expect(component.croppedImage()).toBe('');
        expect(component.blob()).toBeNull();
    });

    it('should upload avatar and close on save', () => {
        component.blob.set(new Blob(['test'], { type: 'image/png' }));
        component.croppedImage.set('data:image/png;base64,...');

        component.save();

        expect(userServiceMock.uploadAvatar).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/jpeg' }));
        expect(dialogRefMock.close).toHaveBeenCalledWith('data:image/png;base64,...');
        expect(component.isLoading()).toBe(false);
        // Screens showing the user's picture ask for the new one.
        expect(avatarServiceMock.invalidate).toHaveBeenCalledWith('me');
    });

    it('save_shouldSayWhenTheServerRefusesTheImage', () => {
        userServiceMock.uploadAvatar.mockReturnValue(throwError(() => new HttpErrorResponse({
            status: 400, error: { code: 'USR-BUS-006' }
        })));
        component.blob.set(new Blob(['x']));

        component.save();
        fixture.detectChanges();

        expect(component.errorMessage()).toContain("n'est pas une image");
        expect(fixture.nativeElement.querySelector('.error-message')).not.toBeNull();
        expect(dialogRefMock.close).not.toHaveBeenCalled();
    });

    it('save_shouldGiveAGeneralMessage_forAnUnexpectedFailure', () => {
        userServiceMock.uploadAvatar.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 502 })));
        component.blob.set(new Blob(['x']));

        component.save();

        expect(component.errorMessage()).toContain('a échoué');
    });

    it('fileChangeEvent_shouldRefuseAFileAboveTheLimitBeforeCropping', () => {
        const big = { size: MAX_SOURCE_BYTES + 1 } as File;

        component.fileChangeEvent({ target: { files: [big] } } as unknown as Event);

        expect(component.imageChangedEvent()).toBeNull();
        expect(component.errorMessage()).toContain('10 Mo');
    });

    it('loadImageFailed_shouldExplainAndLetTheUserPickAnother', () => {
        component.imageChangedEvent.set(new Event('change'));

        component.loadImageFailed();

        expect(component.imageChangedEvent()).toBeNull();
        expect(component.errorMessage()).toContain('ne peut pas être ouverte');
    });

    it('should not upload when nothing has been cropped', () => {
        component.save();

        expect(userServiceMock.uploadAvatar).not.toHaveBeenCalled();
        expect(component.isLoading()).toBe(false);
    });

    it('should stop loading and keep the dialog open when the upload fails', () => {
        userServiceMock.uploadAvatar.mockReturnValue(throwError(() => new Error('refused')));
        component.blob.set(new Blob(['test'], { type: 'image/png' }));

        component.save();

        expect(component.isLoading()).toBe(false);
        expect(dialogRefMock.close).not.toHaveBeenCalled();
    });

    it('should record the file selection so the cropper can read it', () => {
        const event = new Event('change');

        component.fileChangeEvent(event);

        expect(component.imageChangedEvent()).toBe(event);
    });

    it('should clamp a null zoom value to 1', () => {
        // The slider emits null when it is reset, and a null scale would blank the cropper.
        component.onZoomChange({ value: null });

        expect(component.scale()).toBe(1);
    });

    it('should apply a zoom value from the slider', () => {
        component.onZoomChange({ value: 2.5 });

        expect(component.scale()).toBe(2.5);
    });

    it('should close on close()', () => {
        component.close();
        expect(dialogRefMock.close).toHaveBeenCalled();
    });
});
