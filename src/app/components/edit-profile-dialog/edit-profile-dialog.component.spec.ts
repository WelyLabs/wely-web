import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditProfileDialogComponent } from './edit-profile-dialog.component';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { UserService } from '../../services/user.service';
import { ReactiveFormsModule } from '@angular/forms';
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
        expect(component.profileForm.value).toEqual(mockUser);
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

    it('should call updateProfile and close on valid submit', () => {
        const updates = { ...mockUser, userName: 'updated' };
        component.profileForm.patchValue(updates);

        component.onSubmit();

        expect(userServiceMock.updateProfile).toHaveBeenCalledWith(updates);
        expect(dialogRefMock.close).toHaveBeenCalledWith(updates);
    });

    it('should show error message on API failure', () => {
        userServiceMock.updateProfile.mockReturnValue(throwError(() => new Error('API Error')));
        component.onSubmit();
        expect(component.errorMessage).toContain('Erreur lors de la mise à jour');
        expect(component.isLoading).toBe(false);
    });

    it('should close on cancel', () => {
        component.onCancel();
        expect(dialogRefMock.close).toHaveBeenCalledWith(false);
    });
});
