import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MessageToastComponent } from './message-toast';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Message, MessageType } from '../../../models/chat.model';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('MessageToastComponent', () => {
    let component: MessageToastComponent;
    let fixture: ComponentFixture<MessageToastComponent>;
    let snackBarRefMock: any;
    let routerMock: any;
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

    beforeEach(async () => {
        snackBarRefMock = {
            dismiss: vi.fn()
        };
        routerMock = {
            navigate: vi.fn()
        };

        await TestBed.configureTestingModule({
            imports: [MessageToastComponent],
            providers: [
                { provide: MAT_SNACK_BAR_DATA, useValue: mockMessage },
                { provide: MatSnackBarRef, useValue: snackBarRefMock },
                { provide: Router, useValue: routerMock }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(MessageToastComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should navigate to conversation and dismiss on click', () => {
        component.navigateToConversation();
        expect(routerMock.navigate).toHaveBeenCalledWith(['/chat', mockMessage.conversationId]);
        expect(snackBarRefMock.dismiss).toHaveBeenCalled();
    });

    it('should dismiss when dismiss() is called', () => {
        component.dismiss();
        expect(snackBarRefMock.dismiss).toHaveBeenCalled();
    });
});
