import { TestBed } from '@angular/core/testing';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenterService } from '../../../services/notification-center.service';
import { aNotification, notificationCenterStub } from '../../../../testing/notification-center.stub';
import { NotificationToastComponent } from './notification-toast';

describe('NotificationToastComponent', () => {
    let snackBarRef: { dismiss: ReturnType<typeof vi.fn> };
    let router: { navigateByUrl: ReturnType<typeof vi.fn> };
    let center: ReturnType<typeof notificationCenterStub>;

    function create(notification = aNotification()) {
        TestBed.configureTestingModule({
            imports: [NotificationToastComponent],
            providers: [
                { provide: MAT_SNACK_BAR_DATA, useValue: notification },
                { provide: MatSnackBarRef, useValue: snackBarRef },
                { provide: Router, useValue: router },
                { provide: NotificationCenterService, useValue: center }
            ]
        });
        const fixture = TestBed.createComponent(NotificationToastComponent);
        fixture.detectChanges();
        return fixture;
    }

    beforeEach(() => {
        snackBarRef = { dismiss: vi.fn() };
        router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
        center = notificationCenterStub();
    });

    it('template_shouldShowTheTitleBodyAndCategoryIcon', () => {
        const el: HTMLElement = create(aNotification({ type: 'FRIEND_REQUEST', category: 'FRIENDS', title: 'Bob', body: 'veut être ton ami' }))
            .nativeElement;

        expect(el.querySelector('.title')?.textContent).toBe('Bob');
        expect(el.querySelector('.body')?.textContent).toContain('veut être ton ami');
        expect(el.querySelector('.toast-icon mat-icon')?.textContent).toBe('person_add');
    });

    it('open_shouldNavigateToTheLink_markItRead_andDismiss', () => {
        const fixture = create(aNotification({ id: 'n7', link: '/event/e1' }));

        (fixture.nativeElement.querySelector('.toast') as HTMLElement).click();

        expect(router.navigateByUrl).toHaveBeenCalledWith('/event/e1');
        expect(center.markRead).toHaveBeenCalledWith(['n7']);
        expect(snackBarRef.dismiss).toHaveBeenCalled();
    });

    it('dismiss_shouldCloseWithoutNavigating', () => {
        const fixture = create();

        (fixture.nativeElement.querySelector('.close-btn') as HTMLElement).click();

        expect(snackBarRef.dismiss).toHaveBeenCalled();
        expect(router.navigateByUrl).not.toHaveBeenCalled();
        expect(center.markRead).not.toHaveBeenCalled();
    });
});
