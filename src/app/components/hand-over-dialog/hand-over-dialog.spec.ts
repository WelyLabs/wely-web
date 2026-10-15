import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HandOverDialogComponent, HandOverDialogData } from './hand-over-dialog';
import { AvatarService } from '../../services/avatar.service';

describe('HandOverDialogComponent', () => {
    let component: HandOverDialogComponent;
    let fixture: ComponentFixture<HandOverDialogComponent>;
    let close: ReturnType<typeof vi.fn>;
    const data: HandOverDialogData = {
        people: [{ id: 'lea', name: 'Léa Martin' }, { id: 'tom', name: 'Tom' }]
    };

    const el = (): HTMLElement => fixture.nativeElement;
    const radios = () => Array.from(el().querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    const confirmButton = () => el().querySelector<HTMLButtonElement>('.confirm-btn')!;

    beforeEach(async () => {
        close = vi.fn();
        await TestBed.configureTestingModule({
            imports: [HandOverDialogComponent, NoopAnimationsModule],
            providers: [
                { provide: MatDialogRef, useValue: { close } },
                { provide: MAT_DIALOG_DATA, useValue: data },
                { provide: AvatarService, useValue: { url: (id: string) => signal(id === 'lea' ? '/pics/lea.jpg' : null) } }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(HandOverDialogComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('template_shouldListEveryCandidateInARadioGroup', () => {
        expect(el().querySelector('[role="radiogroup"]')).not.toBeNull();
        expect(radios()).toHaveLength(2);
        expect(el().textContent).toContain('Léa Martin');
        expect(el().textContent).toContain('Tom');
    });

    it('template_shouldShowThePicture_orTheInitialsWhenThereIsNone', () => {
        const avatars = el().querySelectorAll('.avatar');
        expect(avatars[0].querySelector('img')?.getAttribute('src')).toBe('/pics/lea.jpg');
        expect(avatars[1].querySelector('img')).toBeNull();
        expect(avatars[1].textContent?.trim()).toBe('TO');
    });

    it('template_shouldDisableTheConfirmation_untilSomeoneIsChosen', () => {
        expect(confirmButton().disabled).toBe(true);

        radios()[1].click();
        fixture.detectChanges();

        expect(component.chosen()).toBe('tom');
        expect(confirmButton().disabled).toBe(false);
        expect(el().querySelectorAll('.person')[1].classList).toContain('selected');
    });

    it('choose_shouldKeepASingleChoice', () => {
        component.choose('lea');
        component.choose('tom');
        fixture.detectChanges();

        expect(component.chosen()).toBe('tom');
        expect(radios().filter(radio => radio.checked)).toHaveLength(1);
    });

    it('onConfirm_shouldCloseWithTheChosenId', () => {
        component.choose('lea');

        component.onConfirm();

        expect(close).toHaveBeenCalledWith('lea');
    });

    it('onConfirm_shouldDoNothing_whenNobodyIsChosen', () => {
        component.onConfirm();

        expect(close).not.toHaveBeenCalled();
    });

    it('onCancel_shouldCloseWithoutAChoice', () => {
        component.choose('lea');

        component.onCancel();

        expect(close).toHaveBeenCalledWith(undefined);
    });

    it('pictureOf_shouldReadTheAvatarService', () => {
        expect(component.pictureOf('lea')).toBe('/pics/lea.jpg');
        expect(component.pictureOf('tom')).toBeNull();
    });
});
