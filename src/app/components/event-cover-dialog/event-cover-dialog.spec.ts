import { Component, input, output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ImageCropperComponent, ImageCroppedEvent } from 'ngx-image-cropper';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { COVER_ASPECT_RATIO, COVER_WIDTH, EventCoverDialogComponent } from './event-cover-dialog';
import { EventService, FeedEvent } from '../../services/event.service';
import { MAX_SOURCE_BYTES } from '../avatar-upload-dialog/avatar-upload-dialog.component';

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

describe('EventCoverDialogComponent', () => {
  let fixture: ComponentFixture<EventCoverDialogComponent>;
  let component: EventCoverDialogComponent;
  let eventService: { uploadCover: ReturnType<typeof vi.fn> };
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  const stored = { id: 'ev-1', image: 'https://media/cover.jpg' } as FeedEvent;
  const picture = (size = 1024) => {
    const file = new File(['x'], 'cover.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', { value: size });
    return file;
  };

  const create = (file: File = picture()) => {
    TestBed.configureTestingModule({
      imports: [EventCoverDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: EventService, useValue: eventService },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { eventId: 'ev-1', file } }
      ]
    });
    TestBed.overrideComponent(EventCoverDialogComponent, {
      remove: { imports: [ImageCropperComponent] },
      add: { imports: [FakeCropperComponent] }
    });
    fixture = TestBed.createComponent(EventCoverDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const cropper = () => fixture.debugElement.query(debug => debug.componentInstance instanceof FakeCropperComponent)
    ?.componentInstance as FakeCropperComponent | undefined;

  beforeEach(() => {
    eventService = { uploadCover: vi.fn().mockReturnValue(of(stored)) };
    dialogRef = { close: vi.fn() };
  });

  it('template_shouldCropThePickedPictureAt16By9_downTo1600Wide', () => {
    const file = picture();
    create(file);

    expect(cropper()?.imageFile()).toBe(file);
    expect(cropper()?.aspectRatio()).toBe(COVER_ASPECT_RATIO);
    expect(cropper()?.resizeToWidth()).toBe(COVER_WIDTH);
    expect(cropper()?.format()).toBe('jpeg');
    expect(cropper()?.onlyScaleDown()).toBe(true);
  });

  it('constructor_shouldRefuseAPictureOver10Mb', () => {
    create(picture(MAX_SOURCE_BYTES + 1));

    expect(component.file()).toBeNull();
    expect(component.errorMessage()).toContain('10 Mo');
    expect(cropper()).toBeUndefined();
  });

  it('save_shouldStayDisabled_untilTheCropperHasAnswered', () => {
    create();
    const save = fixture.nativeElement.querySelector('.save-button') as HTMLButtonElement;

    expect(save.disabled).toBe(true);
    component.save();
    expect(eventService.uploadCover).not.toHaveBeenCalled();
  });

  it('save_shouldUploadTheCrop_andCloseWithTheStoredEvent', () => {
    create();
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
    cropper()?.imageCropped.emit({ blob } as ImageCroppedEvent);

    component.save();

    expect(eventService.uploadCover).toHaveBeenCalledWith('ev-1', blob);
    expect(dialogRef.close).toHaveBeenCalledWith(stored);
  });

  it('save_shouldExplainARefusal_andStayOpen', () => {
    eventService.uploadCover.mockReturnValue(throwError(() =>
      new HttpErrorResponse({ status: 413, error: { code: 'EVT-BUS-012' } })));
    create();
    component.imageCropped({ blob: new Blob(['x']) } as ImageCroppedEvent);

    component.save();

    expect(component.errorMessage()).toContain('trop lourde');
    expect(component.saving()).toBe(false);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('loadImageFailed_shouldOfferToPickAnother', () => {
    create();

    component.loadImageFailed();
    fixture.detectChanges();

    expect(component.errorMessage()).toContain('ne peut pas être ouverte');
    expect(fixture.nativeElement.querySelector('.upload-area')).not.toBeNull();
  });

  it('fileChangeEvent_shouldLoadAnotherPicture', () => {
    create(picture(MAX_SOURCE_BYTES + 1));
    const other = picture();

    component.fileChangeEvent({ target: { files: [other], value: 'C:/other.jpg' } } as unknown as Event);

    expect(component.file()).toBe(other);
    expect(component.errorMessage()).toBe('');
  });

  it('close_shouldCloseWithoutAResult', () => {
    create();

    component.close();

    expect(dialogRef.close).toHaveBeenCalledWith(undefined);
  });
});
