import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditProfileDialogComponent } from './edit-profile-dialog.component';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { UserService } from '../../services/user.service';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('EditProfileDialogComponent', () => {
    let component: EditProfileDialogComponent;
    let fixture: ComponentFixture<EditProfileDialogComponent>;
    let dialogRefMock: any;
    let userServiceMock: any;

    const mockUser = {
        userName: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
    };
    const formValues = { userName: 'testuser', firstName: 'Test', lastName: 'User' };

    beforeEach(async () => {
        dialogRefMock = {
            close: vi.fn()
        };
        userServiceMock = {
            updateProfile: vi.fn().mockReturnValue(of({}))
        };

        await TestBed.configureTestingModule({
            imports: [EditProfileDialogComponent, NoopAnimationsModule, ReactiveFormsModule],
            providers: [
                { provide: MatDialogRef, useValue: dialogRefMock },
                { provide: UserService, useValue: userServiceMock },
                { provide: MAT_DIALOG_DATA, useValue: mockUser }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(EditProfileDialogComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create and initialize form', () => {
        expect(component).toBeTruthy();
        // No email: it stays with Keycloak.
        expect(component.profileForm.value).toEqual(formValues);
    });

    it('should mark form as invalid if fields are empty', () => {
        component.profileForm.patchValue({ userName: '' });
        expect(component.profileForm.invalid).toBe(true);
    });

    it('should NOT call updateProfile on invalid submit', () => {
        component.profileForm.patchValue({ userName: '' });
        component.onSubmit();
        expect(userServiceMock.updateProfile).not.toHaveBeenCalled();
    });

    it('onSubmit_shouldSaveAndCloseWithTheProfileAsStored', () => {
        const saved = { ...formValues, userName: 'updated', hashtag: 1234 };
        userServiceMock.updateProfile.mockReturnValue(of(saved));
        component.profileForm.patchValue({ userName: 'Updated' });

        component.onSubmit();

        expect(userServiceMock.updateProfile).toHaveBeenCalledWith({ ...formValues, userName: 'Updated' });
        expect(dialogRefMock.close).toHaveBeenCalledWith(saved);
    });

    it('onSubmit_shouldFlagTheUsernameField_whenItIsTaken', () => {
        userServiceMock.updateProfile.mockReturnValue(throwError(() => new HttpErrorResponse({
            status: 409, error: { code: 'USR-BUS-004', title: 'Username taken' }
        })));

        component.onSubmit();
        fixture.detectChanges();

        expect(component.profileForm.get('userName')?.hasError('taken')).toBe(true);
        expect(component.errorMessage()).toBe('');
        expect(fixture.nativeElement.textContent).toContain('Ce pseudo est déjà pris');
        expect(dialogRefMock.close).not.toHaveBeenCalled();
    });

    it('onSubmit_shouldShowTheGeneralError_forAnotherConflict', () => {
        userServiceMock.updateProfile.mockReturnValue(throwError(() => new HttpErrorResponse({
            status: 409, error: { code: 'USR-BUS-002' }
        })));

        component.onSubmit();

        expect(component.profileForm.get('userName')?.hasError('taken')).toBe(false);
        expect(component.errorMessage()).toContain('Erreur lors de la mise à jour');
    });

    it('profileForm_shouldRejectAUsernameOverThirtyCharacters', () => {
        component.profileForm.patchValue({ userName: 'a'.repeat(31) });

        expect(component.profileForm.get('userName')?.hasError('maxlength')).toBe(true);
    });

    it('should show error message on API failure', () => {
        userServiceMock.updateProfile.mockReturnValue(throwError(() => new Error('API Error')));
        component.onSubmit();
        expect(component.errorMessage()).toContain('Erreur lors de la mise à jour');
        expect(component.isLoading()).toBe(false);
    });

    it('should close on cancel', () => {
        component.onCancel();
        expect(dialogRefMock.close).toHaveBeenCalledWith(false);
    });
});
