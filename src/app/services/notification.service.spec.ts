import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationService } from './notification.service';
import { NotificationToastComponent } from '../components/shared/toast/notification-toast';
import { aNotification } from '../../testing/notification-center.stub';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Subject } from 'rxjs';

describe('NotificationService', () => {
    let service: NotificationService;
    let snackBarMock: any;

    beforeEach(() => {
        snackBarMock = {
            openFromComponent: vi.fn(),
            open: vi.fn()
        };

        TestBed.configureTestingModule({
            providers: [
                NotificationService,
                { provide: MatSnackBar, useValue: snackBarMock }
            ]
        });

        service = TestBed.inject(NotificationService);
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('showNotification_shouldOpenTheNotificationToast_atTheTop', () => {
        const notification = aNotification();

        service.showNotification(notification);

        expect(snackBarMock.openFromComponent).toHaveBeenCalledWith(
            NotificationToastComponent,
            expect.objectContaining({
                duration: 5000,
                verticalPosition: 'top',
                data: notification,
                panelClass: ['notification-toast-panel']
            })
        );
    });

    it('showAction_shouldRunTheCallback_onlyWhenTheActionIsTaken', () => {
        const action = new Subject<void>();
        snackBarMock.open.mockReturnValue({ onAction: () => action });
        const onAction = vi.fn();

        service.showAction('Événement créé', 'Voir', onAction);

        expect(snackBarMock.open).toHaveBeenCalledWith('Événement créé', 'Voir', expect.objectContaining({ duration: 5000 }));
        expect(onAction).not.toHaveBeenCalled();
        action.next();
        expect(onAction).toHaveBeenCalledTimes(1);
    });

    it('should open info snackbar with correct message', () => {
        const infoMsg = 'Test Info';
        service.showInfo(infoMsg);

        expect(snackBarMock.open).toHaveBeenCalledWith(
            infoMsg,
            'Fermer',
            expect.objectContaining({
                duration: 3000
            })
        );
    });
});
