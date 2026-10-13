import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhotoViewerComponent, PhotoViewerData } from './photo-viewer';
import { ChatPhotoService } from '../../services/chat-photo.service';

describe('PhotoViewerComponent', () => {
  let fixture: ComponentFixture<PhotoViewerComponent>;
  let component: PhotoViewerComponent;
  let photos: { remove: ReturnType<typeof vi.fn> };
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  const create = (canRemove: boolean) => {
    const data: PhotoViewerData = {
      conversationId: 'c1', messageId: 'm1', url: 'https://media/p.jpg', senderName: 'lea',
      sentAt: '2026-10-13T20:00:00Z', canRemove
    };
    TestBed.configureTestingModule({
      imports: [PhotoViewerComponent],
      providers: [
        { provide: ChatPhotoService, useValue: photos },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data }
      ]
    });
    fixture = TestBed.createComponent(PhotoViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(() => {
    photos = { remove: vi.fn().mockReturnValue(of(undefined)) };
    dialogRef = { close: vi.fn() };
  });

  it('template_shouldShowThePhotoAndItsAuthor', () => {
    create(false);

    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe('https://media/p.jpg');
    expect(fixture.nativeElement.textContent).toContain('lea');
    expect(fixture.nativeElement.querySelector('.remove')).toBeNull();
  });

  it('remove_shouldAskForConfirmation_thenRemoveForEveryone', () => {
    create(true);

    component.remove();
    expect(photos.remove).not.toHaveBeenCalled();
    expect(component.confirming()).toBe(true);

    component.remove();
    expect(photos.remove).toHaveBeenCalledWith('c1', 'm1');
    expect(dialogRef.close).toHaveBeenCalledWith('removed');
  });

  it('remove_shouldExplainARefusal_andStayOpen', () => {
    photos.remove.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403, error: { code: 'CHT-BUS-007' } })));
    create(true);

    component.remove();
    component.remove();

    expect(component.errorMessage()).toContain('Seul l’auteur de la photo');
    expect(component.removing()).toBe(false);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });
});
