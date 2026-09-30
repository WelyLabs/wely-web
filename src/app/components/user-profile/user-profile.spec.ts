import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserProfileComponent } from './user-profile';
import { UserService } from '../../services/user.service';
import { MatDialog } from '@angular/material/dialog';
import { of, BehaviorSubject, throwError, Subject } from 'rxjs';
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
                close: () => undefined
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
        expect(component.user()).toEqual(MOCK_USER);
        expect(component.initials()).toBe('TU');
    });

    it('should follow the service stream without a manual subscription', () => {
        // toSignal is what makes this safe: the previous version subscribed to currentUser$ — a
        // long-lived subject — in ngOnInit and never unsubscribed, leaving a live subscriber
        // behind on every visit to the page.
        userSubject.next({ ...MOCK_USER, firstName: 'Alice', lastName: 'Zephyr' });

        expect(component.user()?.firstName).toBe('Alice');
        expect(component.initials()).toBe('AZ');
    });

    it('should report no initials while the user is still unknown', () => {
        userSubject.next(null);

        expect(component.initials()).toBe('');
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
    it('should stop showing the loader when the profile fails to load', () => {
        // The user has to be absent for this to mean anything: with one already emitted, the
        // computed reads false whatever the load did, and the assertion would pass for the
        // wrong reason.
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        userSubject.next(null);
        userServiceMock.loadAndSetCurrentUser.mockReturnValue(throwError(() => new Error('API Error')));

        component.reloadUserProfile();

        expect(component.isLoading()).toBe(false);
        expect(consoleSpy).toHaveBeenCalled();
    });

    it('should show the loader while no user has arrived yet', () => {
        userSubject.next(null);

        expect(component.isLoading()).toBe(true);
    });

    it('should show the loader again when a retry is started', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        userSubject.next(null);
        userServiceMock.loadAndSetCurrentUser.mockReturnValue(throwError(() => new Error('API Error')));
        component.reloadUserProfile();
        expect(component.isLoading()).toBe(false);

        userServiceMock.loadAndSetCurrentUser.mockReturnValue(new Subject());
        component.reloadUserProfile();

        expect(component.isLoading()).toBe(true);
        expect(consoleSpy).toHaveBeenCalled();
    });
});
