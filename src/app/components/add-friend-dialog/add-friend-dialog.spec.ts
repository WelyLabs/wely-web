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
        component.userTag = 'User#1234';
        component.onAdd();
        expect(socialServiceMock.sendFriendRequest).toHaveBeenCalledWith('User#1234');
        expect(dialogRefMock.close).toHaveBeenCalledWith(true);
    });

    it('should show error message on 404', () => {
        socialServiceMock.sendFriendRequest.mockReturnValue(throwError(() => ({ status: 404 })));
        component.userTag = 'NotFound';
        component.onAdd();
        expect(component.errorMessage).toContain('Utilisateur non trouvé');
    });

    it('should call close(false) on cancel', () => {
        component.onCancel();
        expect(dialogRefMock.close).toHaveBeenCalledWith(false);
    });
});
