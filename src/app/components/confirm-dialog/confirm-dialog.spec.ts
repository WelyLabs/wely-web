import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmDialogComponent, ConfirmDialogData, matchesConfirmationPhrase } from './confirm-dialog';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('ConfirmDialogComponent', () => {
    let component: ConfirmDialogComponent;
    let fixture: ComponentFixture<ConfirmDialogComponent>;
    let dialogRefMock: any;
    const mockData: ConfirmDialogData = {
        title: 'Confirm',
        message: 'Are you sure?',
        confirmText: 'Yes',
        cancelText: 'No'
    };

    beforeEach(async () => {
        dialogRefMock = {
            close: vi.fn()
        };

        await TestBed.configureTestingModule({
            imports: [ConfirmDialogComponent, NoopAnimationsModule],
            providers: [
                { provide: MatDialogRef, useValue: dialogRefMock },
                { provide: MAT_DIALOG_DATA, useValue: mockData }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(ConfirmDialogComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should close(true) when onConfirm is called', () => {
        component.onConfirm();
        expect(dialogRefMock.close).toHaveBeenCalledWith(true);
    });

    it('should close(false) when onCancel is called', () => {
        component.onCancel();
        expect(dialogRefMock.close).toHaveBeenCalledWith(false);
    });

    it('canConfirm_shouldBeTrue_withoutAPhrase', () => {
        expect(component.canConfirm()).toBe(true);
        expect(fixture.nativeElement.querySelector('#confirmation-phrase')).toBeNull();
    });
});

describe('matchesConfirmationPhrase', () => {
    it('matchesConfirmationPhrase_shouldIgnoreCaseAndSurroundingSpaces', () => {
        expect(matchesConfirmationPhrase('  Camille#2680 ', 'camille#2680')).toBe(true);
    });

    it('matchesConfirmationPhrase_shouldRefuseAnotherHandle', () => {
        expect(matchesConfirmationPhrase('camille#2681', 'camille#2680')).toBe(false);
        expect(matchesConfirmationPhrase('camille', 'camille#2680')).toBe(false);
    });
});

describe('ConfirmDialogComponent with a confirmation phrase', () => {
    let fixture: ComponentFixture<ConfirmDialogComponent>;
    let component: ConfirmDialogComponent;
    let dialogRefMock: { close: ReturnType<typeof vi.fn> };
    const data: ConfirmDialogData = {
        title: 'Supprimer ton compte ?',
        message: 'La suppression est définitive.',
        confirmText: 'Continuer',
        cancelText: 'Annuler',
        isDestructive: true,
        details: ['Ton profil est effacé.', 'Tes messages restent.'],
        confirmationPhrase: 'camille#2680',
        confirmationLabel: 'Pour confirmer, tape camille#2680'
    };
    const confirmButton = (): HTMLButtonElement => fixture.nativeElement.querySelector('.confirm-btn');
    const field = (): HTMLInputElement => fixture.nativeElement.querySelector('#confirmation-phrase');

    beforeEach(async () => {
        dialogRefMock = { close: vi.fn() };
        await TestBed.configureTestingModule({
            imports: [ConfirmDialogComponent, NoopAnimationsModule],
            providers: [
                { provide: MatDialogRef, useValue: dialogRefMock },
                { provide: MAT_DIALOG_DATA, useValue: data }
            ]
        }).compileComponents();
        fixture = TestBed.createComponent(ConfirmDialogComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('onConfirm_shouldNotClose_untilThePhraseIsTyped', () => {
        component.onConfirm();

        expect(dialogRefMock.close).not.toHaveBeenCalled();
        expect(confirmButton().disabled).toBe(true);
    });

    it('onConfirm_shouldClose_whenThePhraseMatches', () => {
        component.onTyped('Camille#2680');
        component.onConfirm();

        expect(dialogRefMock.close).toHaveBeenCalledWith(true);
    });

    it('onTyped_shouldEnableTheConfirmButton_whenThePhraseMatches', () => {
        field().value = 'camille#2680';
        field().dispatchEvent(new Event('input'));
        fixture.detectChanges();

        expect(component.typed()).toBe('camille#2680');
        expect(confirmButton().disabled).toBe(false);
    });

    it('template_shouldListTheDetails_whenGiven', () => {
        const items = Array.from(fixture.nativeElement.querySelectorAll('.details li')).map(item => (item as HTMLElement).textContent);

        expect(items).toEqual(['Ton profil est effacé.', 'Tes messages restent.']);
        expect(fixture.nativeElement.querySelector('label[for="confirmation-phrase"]')?.textContent).toContain('tape camille#2680');
    });
});
