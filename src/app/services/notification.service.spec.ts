import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationService } from './notification.service';
import { MessageToastComponent } from '../components/shared/toast/message-toast';
import { Message, MessageType } from '../models/chat.model';
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

    it('should open chat notification with correct config', () => {
        const mockMessage: Message = {
            id: '1',
            senderId: 'user1',
            senderName: 'User One',
            receiverId: 'user2',
            conversationId: 'conv1',
            content: 'Hello',
            type: MessageType.TEXT,
            timestamp: new Date().toISOString(),
            reactions: {}
        };

        service.showChatNotification(mockMessage);

        expect(snackBarMock.openFromComponent).toHaveBeenCalledWith(
            MessageToastComponent,
            expect.objectContaining({
                duration: 5000,
                data: mockMessage,
                panelClass: ['chat-notification-panel']
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
