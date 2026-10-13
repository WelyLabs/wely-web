import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhotoViewerComponent, PhotoViewerData } from './photo-viewer';

describe('PhotoViewerComponent', () => {
  let fixture: ComponentFixture<PhotoViewerComponent>;
  let component: PhotoViewerComponent;
  let remove: ReturnType<typeof vi.fn<() => Observable<void>>>;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  const create = (overrides: Partial<PhotoViewerData> = {}) => {
    const data: PhotoViewerData = {
      url: 'https://media/p.jpg', title: 'lea', subtitle: '13 oct. 2026, 20:00', canRemove: true, remove, ...overrides
    };
    TestBed.configureTestingModule({
      imports: [PhotoViewerComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data }
      ]
    });
    fixture = TestBed.createComponent(PhotoViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(() => {
    remove = vi.fn<() => Observable<void>>().mockReturnValue(of(undefined));
    dialogRef = { close: vi.fn() };
  });

  it('template_shouldShowThePhotoItsTitleAndSubtitle', () => {
    create({ canRemove: false });

    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe('https://media/p.jpg');
    expect(fixture.nativeElement.textContent).toContain('lea');
    expect(fixture.nativeElement.textContent).toContain('13 oct. 2026, 20:00');
    expect(fixture.nativeElement.querySelector('.remove')).toBeNull();
  });

  it('template_shouldHideRemove_withoutARemoveAction', () => {
    create({ remove: undefined });

    expect(fixture.nativeElement.querySelector('.remove')).toBeNull();
  });

  it('template_shouldUseTheGivenLabels', () => {
    create({ removeLabel: 'Retirer le ticket', confirmLabel: 'Retirer le ticket ?' });
    const button = () => fixture.nativeElement.querySelector('.remove') as HTMLButtonElement;

    expect(button().textContent).toContain('Retirer le ticket');
    button().click();
    fixture.detectChanges();
    expect(button().textContent).toContain('Retirer le ticket ?');
  });

  it('remove_shouldAskForConfirmation_thenCallTheRemoveAction', () => {
    create();

    component.remove();
    expect(remove).not.toHaveBeenCalled();
    expect(component.confirming()).toBe(true);

    component.remove();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(dialogRef.close).toHaveBeenCalledWith('removed');
  });

  it('remove_shouldDoNothing_withoutARemoveAction', () => {
    create({ remove: undefined });

    component.remove();
    component.remove();

    expect(component.confirming()).toBe(false);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('remove_shouldExplainARefusal_andStayOpen', () => {
    remove.mockReturnValue(throwError(() => new Error('403')));
    create({ removeError: () => 'Seul l’auteur peut la retirer.' });

    component.remove();
    component.remove();

    expect(component.errorMessage()).toBe('Seul l’auteur peut la retirer.');
    expect(component.removing()).toBe(false);
    expect(component.confirming()).toBe(false);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('remove_shouldFallBackOnAGenericMessage', () => {
    remove.mockReturnValue(throwError(() => new Error('502')));
    create();

    component.remove();
    component.remove();

    expect(component.errorMessage()).toContain('n’a pas pu être retirée');
  });

  it('close_shouldCloseWithoutAResult', () => {
    create();

    component.close();

    expect(dialogRef.close).toHaveBeenCalledWith(undefined);
  });
});
