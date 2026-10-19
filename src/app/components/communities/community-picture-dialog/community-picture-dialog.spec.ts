import { Component, input, output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ImageCropperComponent, ImageCroppedEvent } from 'ngx-image-cropper';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { CommunityPictureDialogComponent, PICTURE_SIZE } from './community-picture-dialog';
import { Community } from '../../../models/community.model';
import { CommunityService } from '../../../services/community.service';
import { MAX_SOURCE_BYTES } from '../../avatar-upload-dialog/avatar-upload-dialog.component';

/** Stands in for the real cropper, which needs a canvas the test browser does not have. */
// eslint-disable-next-line @angular-eslint/component-selector
@Component({ selector: 'image-cropper', standalone: true, template: '' })
class FakeCropperComponent {
  readonly imageFile = input<File>();
  readonly maintainAspectRatio = input<boolean>();
  readonly aspectRatio = input<number>();
  readonly format = input<string>();
  readonly imageQuality = input<number>();
  readonly resizeToWidth = input<number>();
  readonly onlyScaleDown = input<boolean>();
  readonly imageCropped = output<ImageCroppedEvent>();
  readonly loadImageFailed = output<void>();
}

const community = (overrides: Partial<Community> = {}): Community => ({
  communityId: 'c1', name: 'Club Auto', description: null, interests: [], visibility: 'PUBLIC',
  createdAt: '2026-10-01T10:00:00Z', memberCount: 3, role: 'ADMIN', friendMembers: [], friendMemberCount: 0,
  pictureUrl: null, ...overrides,
});

describe('CommunityPictureDialogComponent', () => {
  let fixture: ComponentFixture<CommunityPictureDialogComponent>;
  let component: CommunityPictureDialogComponent;
  let communities: { uploadPicture: ReturnType<typeof vi.fn>; removePicture: ReturnType<typeof vi.fn> };
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  const stored = community({ pictureUrl: 'https://media/new.jpg' });
  const picture = (size = 1024) => {
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', { value: size });
    return file;
  };
  const pickEvent = (file: File) => ({ target: { files: [file], value: 'C:/photo.jpg' } }) as unknown as Event;

  const create = (data: Community = community()) => {
    TestBed.configureTestingModule({
      imports: [CommunityPictureDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: CommunityService, useValue: communities },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });
    TestBed.overrideComponent(CommunityPictureDialogComponent, {
      remove: { imports: [ImageCropperComponent] },
      add: { imports: [FakeCropperComponent] },
    });
    fixture = TestBed.createComponent(CommunityPictureDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const cropper = () => fixture.debugElement.query((debug) => debug.componentInstance instanceof FakeCropperComponent)
    ?.componentInstance as FakeCropperComponent | undefined;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    communities = {
      uploadPicture: vi.fn().mockReturnValue(of(stored)),
      removePicture: vi.fn().mockReturnValue(of(community())),
    };
    dialogRef = { close: vi.fn() };
  });

  it('template_shouldShowTheInitials_andOfferNoRemoval_withoutAPicture', () => {
    create();

    expect(el().querySelector('.preview.initials')?.textContent).toContain('CA');
    expect(el().querySelector('.remove-button')).toBeNull();
    expect(el().querySelector('.upload-area')?.textContent).toContain('Choisir une image');
  });

  it('template_shouldShowTheCurrentPicture_andOfferToRemoveIt', () => {
    create(community({ pictureUrl: 'https://media/old.jpg' }));

    expect(el().querySelector('img.preview')?.getAttribute('src')).toBe('https://media/old.jpg');
    expect(el().querySelector('.remove-button')).not.toBeNull();
    expect(el().querySelector('.upload-area')?.textContent).toContain('nouvelle image');
  });

  it('fileChangeEvent_shouldCropThePickedPictureSquare_downTo512', () => {
    create();
    const file = picture();

    component.fileChangeEvent(pickEvent(file));
    fixture.detectChanges();

    expect(cropper()?.imageFile()).toBe(file);
    expect(cropper()?.aspectRatio()).toBe(1);
    expect(cropper()?.resizeToWidth()).toBe(PICTURE_SIZE);
    expect(cropper()?.format()).toBe('jpeg');
    expect(cropper()?.onlyScaleDown()).toBe(true);
  });

  it('fileChangeEvent_shouldHideTheRemoval_whileANewPictureIsCropped', () => {
    create(community({ pictureUrl: 'https://media/old.jpg' }));

    component.fileChangeEvent(pickEvent(picture()));
    fixture.detectChanges();

    expect(component.canRemove()).toBe(false);
    expect(el().querySelector('.remove-button')).toBeNull();
  });

  it('fileChangeEvent_shouldRefuseAPictureOver10Mb', () => {
    create();

    component.fileChangeEvent(pickEvent(picture(MAX_SOURCE_BYTES + 1)));

    expect(component.file()).toBeNull();
    expect(component.errorMessage()).toContain('10 Mo');
  });

  it('fileChangeEvent_shouldIgnoreAnEmptySelection', () => {
    create();

    component.fileChangeEvent({ target: { files: [], value: '' } } as unknown as Event);
    component.fileChangeEvent({ target: null } as unknown as Event);

    expect(component.file()).toBeNull();
  });

  it('save_shouldStayDisabled_untilTheCropperHasAnswered', () => {
    create();
    component.fileChangeEvent(pickEvent(picture()));
    fixture.detectChanges();

    expect((el().querySelector('.save-button') as HTMLButtonElement).disabled).toBe(true);
    component.save();
    expect(communities.uploadPicture).not.toHaveBeenCalled();
  });

  it('save_shouldUploadTheCrop_andCloseWithTheStoredCommunity', () => {
    create();
    component.fileChangeEvent(pickEvent(picture()));
    fixture.detectChanges();
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
    cropper()?.imageCropped.emit({ blob } as ImageCroppedEvent);

    component.save();

    expect(communities.uploadPicture).toHaveBeenCalledWith('c1', blob);
    expect(dialogRef.close).toHaveBeenCalledWith(stored);
  });

  it('save_shouldExplainARefusal_andStayOpen', () => {
    communities.uploadPicture.mockReturnValue(throwError(() =>
      new HttpErrorResponse({ status: 400, error: { code: 'SCL-BUS-020' } })));
    create();
    component.imageCropped({ blob: new Blob(['x']) } as ImageCroppedEvent);

    component.save();

    expect(component.errorMessage()).toContain('JPEG, PNG');
    expect(component.saving()).toBe(false);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('save_shouldFallBackToAGenericMessage_forAnUnknownFailure', () => {
    communities.uploadPicture.mockReturnValue(throwError(() => new Error('offline')));
    create();
    component.imageCropped({ blob: new Blob(['x']) } as ImageCroppedEvent);

    component.save();

    expect(component.errorMessage()).toContain("L'envoi de l'image a échoué");
  });

  it('save_shouldSendOnlyOnce_whileSaving', () => {
    communities.uploadPicture.mockReturnValue(of());
    create();
    component.imageCropped({ blob: new Blob(['x']) } as ImageCroppedEvent);
    component.saving.set(true);

    component.save();

    expect(communities.uploadPicture).not.toHaveBeenCalled();
  });

  it('remove_shouldRemoveThePicture_andCloseWithTheCommunity', () => {
    create(community({ pictureUrl: 'https://media/old.jpg' }));

    (el().querySelector('.remove-button') as HTMLButtonElement).click();

    expect(communities.removePicture).toHaveBeenCalledWith('c1');
    expect(dialogRef.close).toHaveBeenCalledWith(community());
  });

  it('remove_shouldDoNothing_withoutAPicture', () => {
    create();

    component.remove();

    expect(communities.removePicture).not.toHaveBeenCalled();
  });

  it('remove_shouldExplainAFailure', () => {
    communities.removePicture.mockReturnValue(throwError(() =>
      new HttpErrorResponse({ status: 502, error: { code: 'SCL-TEC-004' } })));
    create(community({ pictureUrl: 'https://media/old.jpg' }));

    component.remove();

    expect(component.errorMessage()).toContain("n'a pas pu être enregistrée");
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('loadImageFailed_shouldOfferToPickAnother', () => {
    create();
    component.fileChangeEvent(pickEvent(picture()));

    component.loadImageFailed();
    fixture.detectChanges();

    expect(component.errorMessage()).toContain('ne peut pas être ouverte');
    expect(el().querySelector('.upload-area')).not.toBeNull();
  });

  it('close_shouldCloseWithoutResult', () => {
    create();

    component.close();

    expect(dialogRef.close).toHaveBeenCalledWith(undefined);
  });
});
