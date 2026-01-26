import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('ConfirmDialogComponent', () => {
    let component: ConfirmDialogComponent;
    let fixture: ComponentFixture<ConfirmDialogComponent>;
    let dialogRefMock: any;
    const mockData: ConfirmDialogData = {
        title: 'Confirm',
        message: 'Are you sure?',
        confirmText: 'Yes',
        cancelText: 'No'
    };

    beforeEach(async () => {
        dialogRefMock = {
            close: vi.fn()
        };

        await TestBed.configureTestingModule({
            imports: [ConfirmDialogComponent, NoopAnimationsModule],
            providers: [
                { provide: MatDialogRef, useValue: dialogRefMock },
                { provide: MAT_DIALOG_DATA, useValue: mockData }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(ConfirmDialogComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should close(true) when onConfirm is called', () => {
        component.onConfirm();
        expect(dialogRefMock.close).toHaveBeenCalledWith(true);
    });

    it('should close(false) when onCancel is called', () => {
        component.onCancel();
        expect(dialogRefMock.close).toHaveBeenCalledWith(false);
    });
});
