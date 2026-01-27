import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AvatarUploadDialogComponent } from './avatar-upload-dialog.component';
import { MatDialogRef } from '@angular/material/dialog';
import { UserService } from '../../services/user.service';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ImageCropperComponent } from 'ngx-image-cropper';

describe('AvatarUploadDialogComponent', () => {
    let component: AvatarUploadDialogComponent;
    let fixture: ComponentFixture<AvatarUploadDialogComponent>;
    let dialogRefMock: any;
    let userServiceMock: any;
    let sanitizerMock: any;

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
        const mockEvent: any = { base64: 'data:image/png;base64,...', blob: new Blob() };
        component.imageCropped(mockEvent);
        expect(component.croppedImage).toBe('data:image/png;base64,...');
        expect(component.blob).toEqual(mockEvent.blob);
    });

    it('should upload avatar and close on save', () => {
        component.blob = new Blob(['test'], { type: 'image/png' });
        component.croppedImage = 'data:image/png;base64,...';

        component.save();

        expect(userServiceMock.uploadAvatar).toHaveBeenCalled();
        expect(dialogRefMock.close).toHaveBeenCalledWith('data:image/png;base64,...');
        expect(component.isLoading).toBe(false);
    });

    it('should close on close()', () => {
        component.close();
        expect(dialogRefMock.close).toHaveBeenCalled();
    });
});
