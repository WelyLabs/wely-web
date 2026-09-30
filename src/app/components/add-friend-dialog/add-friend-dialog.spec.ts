import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AddFriendDialogComponent } from './add-friend-dialog';
import { MatDialogRef } from '@angular/material/dialog';
import { SocialService } from '../../services/social.service';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';

describe('AddFriendDialogComponent', () => {
    let component: AddFriendDialogComponent;
    let fixture: ComponentFixture<AddFriendDialogComponent>;
    let dialogRefMock: any;
    let socialServiceMock: any;

    beforeEach(async () => {
        dialogRefMock = {
            close: vi.fn()
        };
        socialServiceMock = {
            sendFriendRequest: vi.fn().mockReturnValue(of({}))
        };

        await TestBed.configureTestingModule({
            imports: [AddFriendDialogComponent, NoopAnimationsModule, FormsModule],
            providers: [
                { provide: MatDialogRef, useValue: dialogRefMock },
                { provide: SocialService, useValue: socialServiceMock }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(AddFriendDialogComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should call close(true) on successful add', () => {
        component.userTag.set('User#1234');
        component.onAdd();
        expect(socialServiceMock.sendFriendRequest).toHaveBeenCalledWith('User#1234');
        expect(dialogRefMock.close).toHaveBeenCalledWith(true);
    });

    it('should show error message on 404', () => {
        socialServiceMock.sendFriendRequest.mockReturnValue(throwError(() => ({ status: 404 })));
        component.userTag.set('NotFound');
        component.onAdd();
        expect(component.errorMessage()).toContain('Utilisateur non trouvé');
    });

    it('should show error message on 409', () => {
        socialServiceMock.sendFriendRequest.mockReturnValue(throwError(() => ({ status: 409 })));
        component.userTag.set('Conflict');
        component.onAdd();
        expect(component.errorMessage()).toContain('déjà en cours');
    });

    it('should show generic error message on other errors', () => {
        socialServiceMock.sendFriendRequest.mockReturnValue(throwError(() => ({ status: 500 })));
        component.userTag.set('Error');
        component.onAdd();
        expect(component.errorMessage()).toContain('erreur est survenue');
    });

    it('should NOT call socialService if userTag is empty', () => {
        component.userTag.set('');
        component.onAdd();
        expect(socialServiceMock.sendFriendRequest).not.toHaveBeenCalled();
    });

    it('should call close(false) on cancel', () => {
        component.onCancel();
        expect(dialogRefMock.close).toHaveBeenCalledWith(false);
    });

    it('should clear a previous error before retrying', () => {
        socialServiceMock.sendFriendRequest.mockReturnValue(throwError(() => ({ status: 404 })));
        component.userTag.set('NotFound');
        component.onAdd();
        expect(component.errorMessage()).not.toBeNull();

        socialServiceMock.sendFriendRequest.mockReturnValue(of({}));
        component.onAdd();

        expect(component.errorMessage()).toBeNull();
    });

    it('should stop loading whether the request succeeds or fails', () => {
        // finalize, not a duplicated set in both callbacks: the previous version would have
        // left the dialog spinning on any error path that was added later and forgotten.
        socialServiceMock.sendFriendRequest.mockReturnValue(throwError(() => ({ status: 500 })));
        component.userTag.set('Error');
        component.onAdd();
        expect(component.isLoading()).toBe(false);

        socialServiceMock.sendFriendRequest.mockReturnValue(of({}));
        component.onAdd();
        expect(component.isLoading()).toBe(false);
    });
});
