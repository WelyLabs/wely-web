import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ExpenseDialogComponent, ExpenseDialogData, previewOwed } from './expense-dialog';
import { ExpenseService } from '../../services/expense.service';
import { Expense } from '../../models/expense.model';

describe('previewOwed', () => {
  it('previewOwed_shouldGiveTheExtraCentsInIdOrder_whenEqual', () => {
    const owed = previewOwed(1000, 'EQUAL', [{ userId: 'carol', value: 0 }, { userId: 'alice', value: 0 }, { userId: 'bob', value: 0 }]);

    expect(Object.fromEntries(owed)).toEqual({ carol: 333, alice: 334, bob: 333 });
  });

  it('previewOwed_shouldWeighShares_andAddUp', () => {
    const owed = previewOwed(100, 'SHARES', [{ userId: 'b', value: 1 }, { userId: 'a', value: 1 }, { userId: 'c', value: 1 }]);

    expect(Object.fromEntries(owed)).toEqual({ a: 34, b: 33, c: 33 });
  });

  it('previewOwed_shouldUseTheTypedAmounts_whenExact', () => {
    const owed = previewOwed(1250, 'EXACT', [{ userId: 'a', value: 1000 }, { userId: 'b', value: 250 }]);

    expect(Object.fromEntries(owed)).toEqual({ a: 1000, b: 250 });
  });

  it('previewOwed_shouldBeEmpty_withoutAnAmountOrPeople', () => {
    expect(previewOwed(0, 'EQUAL', [{ userId: 'a', value: 0 }]).size).toBe(0);
    expect(previewOwed(100, 'EQUAL', []).size).toBe(0);
  });
});

describe('ExpenseDialogComponent', () => {
  let fixture: ComponentFixture<ExpenseDialogComponent>;
  let component: ExpenseDialogComponent;
  let expenseService: { add: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  const members = [
    { id: 'me', name: 'Toi', initials: 'TO' },
    { id: 'lea', name: 'lea', initials: 'LE' },
    { id: 'bob', name: 'bob', initials: 'BO' }
  ];
  const stored: Expense = {
    id: 'x1', title: 'Courses', amountCents: 1250, currency: 'EUR', paidBy: 'lea', createdBy: 'me', kind: 'EXPENSE',
    split: 'EXACT', shares: [{ userId: 'me', value: 1000 }, { userId: 'lea', value: 250 }],
    owedCents: { me: 1000, lea: 250 }, spentAt: new Date(), version: 4
  };

  const create = (data: Partial<ExpenseDialogData> = {}) => {
    TestBed.configureTestingModule({
      imports: [ExpenseDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: ExpenseService, useValue: expenseService },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { eventId: 'ev-1', members, meId: 'me', ...data } }
      ]
    });
    fixture = TestBed.createComponent(ExpenseDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(() => {
    expenseService = {
      add: vi.fn().mockReturnValue(of(stored)),
      update: vi.fn().mockReturnValue(of(stored)),
      delete: vi.fn().mockReturnValue(of(undefined))
    };
    dialogRef = { close: vi.fn() };
  });

  it('save_shouldAddAnEqualExpenseForEveryone_paidByTheViewer', () => {
    create();
    component.title.set('Courses');
    component.amountText.set('30');

    component.save();

    expect(expenseService.add).toHaveBeenCalledWith('ev-1', {
      title: 'Courses', amountCents: 3000, paidBy: 'me', split: 'EQUAL',
      shares: [{ userId: 'me', value: 0 }, { userId: 'lea', value: 0 }, { userId: 'bob', value: 0 }], version: null
    });
    expect(dialogRef.close).toHaveBeenCalledWith('saved');
  });

  it('save_shouldSendOnlyThePeopleTicked_withTheirWeights', () => {
    create();
    component.title.set('Location');
    component.amountText.set('90');
    component.split.set('SHARES');
    component.toggle('bob');
    component.setWeight('me', '2');

    component.save();

    expect(expenseService.add.mock.calls[0][1].shares).toEqual([{ userId: 'me', value: 2 }, { userId: 'lea', value: 1 }]);
  });

  it('invalidReason_shouldHoldTheSave_untilExactAmountsAddUp', () => {
    create();
    component.title.set('Resto');
    component.amountText.set('20');
    component.split.set('EXACT');
    component.toggle('bob');
    component.setExact('me', '12');
    component.setExact('lea', '5');

    expect(component.remainingLabel().replace(/\s/g, ' ')).toBe('Reste 3,00 € à répartir');
    component.save();
    expect(expenseService.add).not.toHaveBeenCalled();

    component.setExact('lea', '8');
    expect(component.invalidReason()).toBeNull();
  });

  it('invalidReason_shouldAskForATitleAndAnAmount', () => {
    create();

    expect(component.invalidReason()).toBe('Donne un titre à la dépense.');
    component.title.set('Essence');
    expect(component.invalidReason()).toBe('Indique un montant, par exemple 12,50.');
    component.amountText.set('abc');
    expect(component.invalidReason()).toBe('Indique un montant, par exemple 12,50.');
  });

  it('constructor_shouldStartFromTheExpense_whenEditing', () => {
    create({ expense: stored, canDelete: true });

    expect(component.title()).toBe('Courses');
    expect(component.amountText()).toBe('12,50');
    expect(component.paidBy()).toBe('lea');
    expect([...component.included()]).toEqual(['me', 'lea']);
    expect(component.exactTexts()['me']).toBe('10,00');
  });

  it('save_shouldUpdateWithTheVersionRead_whenEditing', () => {
    create({ expense: stored, canDelete: true });

    component.save();

    expect(expenseService.update).toHaveBeenCalledWith('ev-1', 'x1', expect.objectContaining({ version: 4, amountCents: 1250 }));
  });

  it('save_shouldExplainAConflict_andStayOpen', () => {
    expenseService.update.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'EVT-BUS-010' } })));
    create({ expense: stored, canDelete: true });

    component.save();

    expect(component.errorMessage()).toContain('Quelqu’un vient de modifier cette dépense');
    expect(component.saving()).toBe(false);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('remove_shouldDeleteTheExpense', () => {
    create({ expense: stored, canDelete: true });

    component.remove();

    expect(expenseService.delete).toHaveBeenCalledWith('ev-1', 'x1');
    expect(dialogRef.close).toHaveBeenCalledWith('deleted');
  });

  it('template_shouldOfferDeleteOnlyWhenAllowed', () => {
    create({ expense: stored, canDelete: false });

    expect(fixture.nativeElement.querySelector('.delete-button')).toBeNull();
  });
});
