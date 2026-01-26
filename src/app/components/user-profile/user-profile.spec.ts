import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserProfileComponent } from './user-profile';
import { UserService } from '../../services/user.service';
import { MatDialog } from '@angular/material/dialog';
import { of, BehaviorSubject } from 'rxjs';
import { User } from '../../models/user.model';
import { MOCK_USER } from '../../models/user.mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('UserProfileComponent', () => {
    let component: UserProfileComponent;
    let fixture: ComponentFixture<UserProfileComponent>;
    let userServiceMock: any;
    let dialogMock: any;
    let userSubject: BehaviorSubject<User | null>;

    beforeEach(async () => {
        userSubject = new BehaviorSubject<User | null>(MOCK_USER);
        userServiceMock = {
            currentUser$: userSubject.asObservable(),
            loadAndSetCurrentUser: vi.fn().mockReturnValue(of(MOCK_USER)),
            updateCurrentUser: vi.fn()
        };
        dialogMock = {
            open: vi.fn().mockImplementation(() => ({
                afterClosed: () => of(true),
                close: () => { }
            }))
        };

        await TestBed.configureTestingModule({
            imports: [UserProfileComponent, NoopAnimationsModule]
        }).overrideComponent(UserProfileComponent, {
            set: {
                providers: [
                    { provide: UserService, useValue: userServiceMock },
                    { provide: MatDialog, useValue: dialogMock }
                ]
            }
        }).compileComponents();

        fixture = TestBed.createComponent(UserProfileComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should load user data and show initials on init', () => {
        expect(component.user).toEqual(MOCK_USER);
        expect(component.getInitials()).toBe('TU');
    });

    it('should call reloadUserProfile on init', () => {
        expect(userServiceMock.loadAndSetCurrentUser).toHaveBeenCalled();
    });

    it('should open avatar dialog and reload on confirm', () => {
        component.openAvatarDialog();
        expect(dialogMock.open).toHaveBeenCalled();
        expect(userServiceMock.loadAndSetCurrentUser).toHaveBeenCalledTimes(2); // Initial + afterClosed
    });

    it('should open edit dialog and update user on confirm', () => {
        const editResult = { userName: 'new', firstName: 'New', lastName: 'Name', email: 'new@test.com' };
        dialogMock.open.mockReturnValue({ afterClosed: () => of(editResult) });

        component.openEditDialog();

        expect(dialogMock.open).toHaveBeenCalled();
        expect(userServiceMock.updateCurrentUser).toHaveBeenCalledWith(editResult);
    });
});
