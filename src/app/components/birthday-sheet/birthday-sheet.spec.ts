import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, expect, it, vi } from 'vitest';
import { BirthdaySheetComponent, birthdayHeading, birthdayOptions } from './birthday-sheet';
import { BirthdayOccurrence } from '../../models/birthday.model';
import { AvatarService } from '../../services/avatar.service';

const occurrence = (overrides: Partial<BirthdayOccurrence> = {}): BirthdayOccurrence => ({
    userId: 'lea', name: 'Léa', date: '2027-03-12', mine: false, closeness: 'CLOSE', canOrganize: true, surprise: null,
    ...overrides
});

describe('birthdayOptions', () => {
    const actions = (birthday: BirthdayOccurrence) => birthdayOptions(birthday).map(option => option.action);

    it('birthdayOptions_shouldOfferToOrganize_whenAllowedAndNoSurpriseYet', () => {
        expect(actions(occurrence())).toEqual(['organize', 'profile']);
    });

    it('birthdayOptions_shouldOfferToJoinOrSee_whenASurpriseExists', () => {
        expect(actions(occurrence({ surprise: { eventId: 's1', organizerId: 'zoe', joined: false } }))).toEqual(['join', 'view', 'profile']);
        expect(actions(occurrence({ surprise: { eventId: 's1', organizerId: 'zoe', joined: true } }))).toEqual(['view', 'profile']);
    });

    it('birthdayOptions_shouldOnlyOfferTheProfile_toAFriendWhoMayNotOrganize', () => {
        expect(actions(occurrence({ closeness: 'FRIEND', canOrganize: false }))).toEqual(['profile']);
    });

    it('birthdayOptions_shouldOfferNothing_forOnesOwnBirthday', () => {
        expect(birthdayOptions(occurrence({ mine: true, closeness: null }))).toEqual([]);
    });

    it('birthdayHeading_shouldSayWhoseAndTheDay_neverTheYear', () => {
        expect(birthdayHeading(occurrence())).toBe('Anniversaire de Léa · 12 mars');
        expect(birthdayHeading(occurrence({ mine: true }))).toBe('Ton anniversaire · 12 mars');
    });
});

describe('BirthdaySheetComponent', () => {
    let fixture: ComponentFixture<BirthdaySheetComponent>;
    let close: ReturnType<typeof vi.fn>;

    const create = (birthday: BirthdayOccurrence) => {
        close = vi.fn();
        TestBed.configureTestingModule({
            imports: [BirthdaySheetComponent],
            providers: [
                { provide: MAT_DIALOG_DATA, useValue: birthday },
                { provide: MatDialogRef, useValue: { close } },
                { provide: AvatarService, useValue: { url: () => signal(null) } }
            ]
        });
        fixture = TestBed.createComponent(BirthdaySheetComponent);
        fixture.detectChanges();
        return fixture.nativeElement as HTMLElement;
    };

    it('choose_shouldCloseWithTheAction', () => {
        const el = create(occurrence({ closeness: 'INTIMATE' }));

        el.querySelector<HTMLButtonElement>('.sheet-primary')!.click();

        expect(el.querySelector('.birthday-sheet')?.classList).toContain('tone-intimate');
        expect(el.textContent).toContain('Organiser une surprise');
        expect(close).toHaveBeenCalledWith('organize');
    });

    it('close_shouldCloseWithoutAnAction', () => {
        const el = create(occurrence({ mine: true, closeness: null }));

        el.querySelector<HTMLButtonElement>('.sheet-close')!.click();

        expect(el.querySelector('.sheet-actions')).toBeNull();
        expect(close).toHaveBeenCalledWith();
    });
});
