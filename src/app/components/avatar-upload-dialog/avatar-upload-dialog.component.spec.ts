import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AvatarUploadDialogComponent } from './avatar-upload-dialog.component';
import { MatDialogRef } from '@angular/material/dialog';
import { UserService } from '../../services/user.service';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ImageCropperComponent, ImageCroppedEvent } from 'ngx-image-cropper';

describe('AvatarUploadDialogComponent', () => {
    let component: AvatarUploadDialogComponent;
    let fixture: ComponentFixture<AvatarUploadDialogComponent>;
    let dialogRefMock: any;
    let userServiceMock: any;

    beforeEach(async () => {
        dialogRefMock = {
            close: vi.fn()
        };
        userServiceMock = {
            uploadAvatar: vi.fn().mockReturnValue(of({ profilePicUrl: 'new-url' }))
        };

        await TestBed.configureTestingModule({
            imports: [AvatarUploadDialogComponent, NoopAnimationsModule, ImageCropperComponent],
            providers: [
                { provide: MatDialogRef, useValue: dialogRefMock },
                { provide: UserService, useValue: userServiceMock }
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

        expect(userServiceMock.uploadAvatar).toHaveBeenCalled();
        expect(dialogRefMock.close).toHaveBeenCalledWith('data:image/png;base64,...');
        expect(component.isLoading()).toBe(false);
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
